#!/usr/bin/env node
// Importa a base aberta do CNPJ (Receita Federal) para um SQLite local, só com
// empresas ATIVAS no Brasil — usada pela busca por setor/cidade/porte da Prospecção.
//
//   node server/cnpj/importer.js --month 2026-11 --dir /home/ubuntu/cnpj-data [--keep-zips] [--only=estab,empresas,simples]
//
// • Baixa um ZIP por vez do compartilhamento oficial (arquivos.receitafederal.gov.br),
//   com retomada; lê o CSV em fluxo (python3 zipfile → stdin, sem descompactar no disco);
//   apaga o ZIP logo depois.
// • Monta tudo em cnpj.next.db e só no fim troca por cnpj.db (a busca não para).
// • Feito para VM pequena: memória baixa, rode com `nice -n 19`.
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { spawn, execFileSync } = require('child_process')
const { DatabaseSync } = require('node:sqlite')
const L = require('./layout')

const SHARE = process.env.CNPJ_SHARE_TOKEN || 'gn672Ad4CF8N6TK' // link público da Receita (não é segredo)
const BASE = process.env.CNPJ_WEBDAV || 'https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ'

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const pos = process.argv.slice(2)
const argVal = (name) => args[name] !== true && args[name] != null ? args[name] : pos[pos.indexOf(`--${name}`) + 1]
let MONTH = argVal('month')
const DIR = argVal('dir') || (process.env.CNPJ_DB_PATH ? path.dirname(process.env.CNPJ_DB_PATH) : path.join(__dirname, '..', '..', '..', 'cnpj-data'))
const KEEP = Boolean(args['keep-zips'])
const FORCE = Boolean(args.force)
if (MONTH !== 'latest' && !/^\d{4}-\d{2}$/.test(MONTH || '')) { console.error('Use --month AAAA-MM ou --month latest'); process.exit(1) }
fs.mkdirSync(DIR, { recursive: true })

// Competência mais nova publicada (pastas AAAA-MM no compartilhamento).
function latestMonth() {
  const xml = execFileSync('curl', ['-sS', '--fail', '-m', '120', '-u', `${SHARE}:`, '-X', 'PROPFIND', '-H', 'Depth: 1', `${BASE}/`]).toString()
  const months = [...xml.matchAll(/\/(\d{4}-\d{2})\/<\/d:href>/g)].map(m => m[1]).sort()
  if (!months.length) throw new Error('não achei competências no compartilhamento da Receita')
  return months.at(-1)
}

// Competência que uma importação parcial estava trazendo.
function currentMonthOf(file) {
  try {
    const d = new DatabaseSync(file, { readOnly: true })
    const v = d.prepare("select value from meta where key = 'target'").get()?.value || null
    d.close()
    return v
  } catch { return null }
}

// Competência da base em uso (ou null).
function currentMonth(file) {
  try {
    const d = new DatabaseSync(file, { readOnly: true })
    const v = d.prepare("select value from meta where key = 'competencia'").get()?.value || null
    d.close()
    return v
  } catch { return null }
}

const NEXT = path.join(DIR, 'cnpj.next.db')
const FINAL = path.join(DIR, 'cnpj.db')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ── Banco ───────────────────────────────────────────────────────────────────
const SCHEMA = `
  pragma journal_mode = off;
  pragma synchronous = off;
  pragma temp_store = file;
  pragma cache_size = -32000;
  create table if not exists meta (key text primary key, value text);
  create table if not exists estab (
    cnpj text not null, basico text not null, matriz integer, fantasia text, abertura text,
    cnae integer, uf text, municipio integer, bairro text, cep text, endereco text,
    tel1 text, tel2 text, email text, celular integer
  );
  create table if not exists empresas (
    basico text primary key, razao text, natureza integer, capital real, porte integer,
    simples integer default 0, mei integer default 0
  ) without rowid;
  create table if not exists cnaes (code integer primary key, name text, name_fold text, total integer default 0);
  create table if not exists municipios (code integer primary key, name text);
  create table if not exists cidades (uf text, code integer, name text, name_fold text, total integer, primary key (uf, code)) without rowid;
`

function db() {
  const d = new DatabaseSync(NEXT)
  d.exec(SCHEMA)
  return d
}

// ── Download + leitura em fluxo ─────────────────────────────────────────────
function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'], ...opts })
    p.on('error', reject)
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com ${code}`))))
  })
}

async function download(name) {
  const file = path.join(DIR, name)
  if (fs.existsSync(file + '.ok')) return file
  log(`baixando ${name}…`)
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await run('curl', ['-sS', '--fail', '-L', '--retry', '8', '--retry-delay', '20', '--retry-all-errors', '--speed-limit', '20000', '--speed-time', '120',
        '-C', '-', '-u', `${SHARE}:`, '-o', file, `${BASE}/${MONTH}/${name}`])
      fs.writeFileSync(file + '.ok', '')
      log(`baixado ${name} (${(fs.statSync(file).size / 1e6).toFixed(0)} MB)`)
      return file
    } catch (e) {
      log(`falha ao baixar ${name} (tentativa ${attempt}): ${e.message}`)
      await new Promise(r => setTimeout(r, 30_000 * attempt))
    }
  }
  throw new Error(`não consegui baixar ${name}`)
}

const UNZIP = 'import sys,zipfile,shutil\nz=zipfile.ZipFile(sys.argv[1])\nfor n in z.namelist():\n  with z.open(n) as f: shutil.copyfileobj(f, sys.stdout.buffer, 1<<20)\n'

// Chama onRow(campos) para cada linha do CSV dentro do ZIP.
async function eachLine(file, onRow) {
  const py = spawn(process.env.CNPJ_PYTHON || 'python3', ['-c', UNZIP, file], { stdio: ['ignore', 'pipe', 'inherit'] })
  py.stdout.setEncoding('latin1')
  const rl = readline.createInterface({ input: py.stdout, crlfDelay: Infinity })
  let n = 0
  for await (const line of rl) {
    onRow(L.parseLine(line))
    if (++n % 2_000_000 === 0) log(`  ${(n / 1e6).toFixed(0)} mi linhas`)
  }
  await new Promise((resolve, reject) => py.on('close', c => (c === 0 ? resolve() : reject(new Error(`unzip saiu com ${c}`)))))
  return n
}

function done(file) {
  if (KEEP) return
  try { fs.unlinkSync(file); fs.unlinkSync(file + '.ok') } catch { /* ok */ }
}

// Transação em lotes (memória baixa, gravação rápida).
function batcher(d, stmt, size = 20_000) {
  let pending = 0
  d.exec('begin')
  return {
    add(...vals) { stmt.run(...vals); if (++pending >= size) { d.exec('commit'); d.exec('begin'); pending = 0 } },
    end() { d.exec('commit') },
  }
}

const stepDone = (d, step) => d.prepare('select value from meta where key = ?').get(`step:${step}`)
const markStep = (d, step) => d.prepare('insert or replace into meta (key, value) values (?, ?)').run(`step:${step}`, new Date().toISOString())

// ── Etapas ──────────────────────────────────────────────────────────────────
async function loadCodes(d, name, table) {
  if (stepDone(d, table)) return
  const file = await download(name)
  const ins = d.prepare(`insert or replace into ${table} (code, name${table === 'cnaes' ? ', name_fold' : ''}) values (?, ?${table === 'cnaes' ? ', ?' : ''})`)
  const b = batcher(d, ins)
  await eachLine(file, f => {
    const r = L.codeRow(f)
    if (!r) return
    if (table === 'cnaes') b.add(r.code, r.name, L.fold(r.name)); else b.add(r.code, r.name)
  })
  b.end(); done(file); markStep(d, table)
  log(`${table}: ok`)
}

async function loadEstab(d) {
  const ins = d.prepare('insert into estab values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  for (let i = 0; i <= 9; i++) {
    const step = `estab${i}`
    if (stepDone(d, step)) continue
    const file = await download(`Estabelecimentos${i}.zip`)
    // Retomada: se uma tentativa anterior caiu no meio deste arquivo, apaga o que ela gravou.
    const startKey = `start:${step}`
    const prev = d.prepare('select value from meta where key = ?').get(startKey)
    if (prev) d.prepare('delete from estab where rowid > ?').run(Number(prev.value))
    else d.prepare('insert into meta (key, value) values (?, ?)').run(startKey, String(d.prepare('select coalesce(max(rowid), 0) as m from estab').get().m))
    let kept = 0
    const b = batcher(d, ins)
    const total = await eachLine(file, f => {
      const r = L.estabRow(f)
      if (!r) return
      b.add(r.cnpj, r.basico, r.matriz, r.fantasia, r.abertura, r.cnae, r.uf, r.municipio, r.bairro, r.cep, r.endereco, r.tel1, r.tel2, r.email, r.celular)
      kept++
    })
    b.end(); done(file); markStep(d, step)
    log(`Estabelecimentos${i}: ${total} linhas, ${kept} ativas`)
  }
}

async function loadEmpresas(d) {
  if (!stepDone(d, 'idx_basico')) {
    log('índice por CNPJ básico…')
    d.exec('create index if not exists estab_basico on estab (basico)')
    markStep(d, 'idx_basico')
  }
  // Só empresas que têm estabelecimento ativo (as demais não interessam).
  const ins = d.prepare('insert or replace into empresas (basico, razao, natureza, capital, porte) select ?, ?, ?, ?, ? where exists (select 1 from estab where basico = ?)')
  for (let i = 0; i <= 9; i++) {
    const step = `empresas${i}`
    if (stepDone(d, step)) continue
    const file = await download(`Empresas${i}.zip`)
    const b = batcher(d, ins)
    const total = await eachLine(file, f => {
      const r = L.empresaRow(f)
      if (r) b.add(r.basico, r.razao, r.natureza, r.capital, r.porte, r.basico)
    })
    b.end(); done(file); markStep(d, step)
    log(`Empresas${i}: ${total} linhas`)
  }
}

async function loadSimples(d) {
  if (stepDone(d, 'simples')) return
  const file = await download('Simples.zip')
  const up = d.prepare('update empresas set simples = ?, mei = ? where basico = ?')
  const b = batcher(d, up)
  const total = await eachLine(file, f => {
    const r = L.simplesRow(f)
    if (r && (r.simples || r.mei)) b.add(r.simples, r.mei, r.basico)
  })
  b.end(); done(file); markStep(d, 'simples')
  log(`Simples: ${total} linhas`)
}

function finish(d) {
  if (!stepDone(d, 'indexes')) {
    log('índices de busca (demora)…')
    d.exec('drop index if exists estab_basico')
    d.exec('drop index if exists estab_cnae_uf')
    d.exec('drop index if exists estab_uf_mun')
    for (const sql of require('./search').INDEXES) d.exec(sql)
    markStep(d, 'indexes')
  }
  log('resumos de CNAE e cidades…')
  d.exec('update cnaes set total = coalesce((select count(*) from estab where estab.cnae = cnaes.code), 0)')
  d.exec('delete from cidades')
  const rows = d.prepare('select uf, municipio as code, count(*) as total from estab where municipio is not null group by uf, municipio').all()
  const name = d.prepare('select name from municipios where code = ?')
  const ins = d.prepare('insert or replace into cidades (uf, code, name, name_fold, total) values (?, ?, ?, ?, ?)')
  d.exec('begin')
  for (const r of rows) {
    const n = L.titleCase(name.get(r.code)?.name) || String(r.code)
    ins.run(r.uf, r.code, n, L.fold(n), r.total)
  }
  d.exec('commit')
  const count = d.prepare('select count(*) as n from estab').get().n
  const set = d.prepare('insert or replace into meta (key, value) values (?, ?)')
  set.run('competencia', MONTH)
  set.run('imported_at', new Date().toISOString())
  set.run('estabelecimentos', String(count))
  d.exec('analyze')
  log(`pronto: ${count} estabelecimentos ativos`)
}

;(async () => {
  const started = Date.now()
  if (MONTH === 'latest') MONTH = latestMonth()
  if (!FORCE && currentMonth(FINAL) === MONTH) { log(`base já está na competência ${MONTH} — nada a fazer`); return }
  // Importação parcial de OUTRA competência: recomeça do zero (zips e base temporária).
  if (fs.existsSync(NEXT)) {
    const partial = currentMonthOf(NEXT)
    if (partial && partial !== MONTH) {
      log(`descartando importação parcial de ${partial}`)
      fs.unlinkSync(NEXT)
      for (const f of fs.readdirSync(DIR)) if (/\.zip(\.ok)?$/.test(f)) fs.unlinkSync(path.join(DIR, f))
    }
  }
  log(`importando CNPJ ${MONTH} em ${DIR}`)
  const d = db()
  d.prepare("insert or replace into meta (key, value) values ('target', ?)").run(MONTH)
  await loadCodes(d, 'Cnaes.zip', 'cnaes')
  await loadCodes(d, 'Municipios.zip', 'municipios')
  await loadEstab(d)
  await loadEmpresas(d)
  await loadSimples(d)
  finish(d)
  d.close()
  fs.renameSync(NEXT, FINAL) // troca atômica: a busca passa a usar a base nova
  log(`base trocada → ${FINAL} (${(fs.statSync(FINAL).size / 1e9).toFixed(2)} GB) em ${((Date.now() - started) / 60000).toFixed(0)} min`)
})().catch(e => { console.error('ERRO', e); process.exit(1) })
