// Base do CNPJ: leitura do layout da Receita, importação de ponta a ponta com
// ZIPs de exemplo (latin1, ";" e aspas, como os oficiais) e busca.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

const require = createRequire(import.meta.url)
const L = require('./layout')
const S = require('./search')

const q = (...f) => f.map(v => `"${v}"`).join(';')
// 30 colunas de Estabelecimentos
const estab = ({ b, o = '0001', dv = '00', mf = '1', fant = '', sit = '02', ini = '20150310', cnae, rua = '', num = '', bairro = '', cep = '', uf, mun, d1 = '', t1 = '', d2 = '', t2 = '', email = '' }) =>
  q(b, o, dv, mf, fant, sit, '20200101', '00', '', '', ini, cnae, '', 'RUA', rua, num, '', bairro, cep, uf, mun, d1, t1, d2, t2, '', '', email, '', '')

describe('layout da Receita', () => {
  it('lê a linha com aspas e ponto e vírgula', () => {
    expect(L.parseLine('"a";"b c";""\r')).toEqual(['a', 'b c', ''])
  })

  it('estabelecimento ativo vira registro; baixado ou do exterior é descartado', () => {
    const f = L.parseLine(estab({ b: '11222333', dv: '81', fant: 'SORRISO ODONTOLOGIA', cnae: '8630504', rua: 'DAS FLORES', num: '100', bairro: 'CENTRO', cep: '01001000', uf: 'SP', mun: '7107', d1: '11', t1: '987654321', d2: '11', t2: '33334444', email: 'CONTATO@SORRISO.COM.BR' }))
    expect(L.estabRow(f)).toEqual({
      cnpj: '11222333000181', basico: '11222333', matriz: 1, fantasia: 'Sorriso Odontologia', abertura: '20150310', cnae: 8630504,
      uf: 'SP', municipio: 7107, bairro: 'Centro', cep: '01001000', endereco: 'Rua das Flores, 100',
      tel1: '11987654321', tel2: '1133334444', email: 'contato@sorriso.com.br', celular: 1,
    })
    expect(L.estabRow(L.parseLine(estab({ b: '1', sit: '08', cnae: '1', uf: 'SP', mun: '1' })))).toBeNull()
    expect(L.estabRow(L.parseLine(estab({ b: '11222333', cnae: '1', uf: 'EX', mun: '9707' })))).toBeNull()
  })

  it('telefone: DDD com zero, número repetido ou curto é descartado', () => {
    expect(L.phoneOf('011', '33334444')).toBe('1133334444')
    expect(L.phoneOf('11', '00000000')).toBeNull()
    expect(L.phoneOf('11', '1234')).toBeNull()
    expect(L.isMobile('11987654321')).toBe(true)
    expect(L.isMobile('1133334444')).toBe(false)
  })

  it('empresa: capital com vírgula e porte', () => {
    expect(L.empresaRow(L.parseLine(q('11222333', 'SORRISO ODONTOLOGIA LTDA', '2062', '49', '50000,00', '03', '')))).toEqual({ basico: '11222333', razao: 'Sorriso Odontologia LTDA', natureza: 2062, capital: 50000, porte: 3 })
  })
})

describe('importação + busca (ponta a ponta)', () => {
  let dir, db
  const zip = (name, text) => {
    const csv = path.join(dir, name.replace('.zip', '.CSV'))
    fs.writeFileSync(csv, Buffer.from(text, 'latin1'))
    const py = spawnSync(process.env.CNPJ_PYTHON || 'python', ['-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)\nz.write(sys.argv[2],"K3241.K03200Y0.D61108.CSV")\nz.close()', path.join(dir, name), csv])
    if (py.status !== 0) throw new Error(String(py.stderr))
    fs.unlinkSync(csv)
    fs.writeFileSync(path.join(dir, name) + '.ok', '')
  }

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cnpj-'))
    zip('Cnaes.zip', [q('8630504', 'Atividade odontológica'), q('1091102', 'Fabricação de produtos de padaria e confeitaria com predominância de produção própria')].join('\n'))
    zip('Municipios.zip', [q('7107', 'SAO PAULO'), q('6001', 'RIO DE JANEIRO')].join('\n'))
    zip('Estabelecimentos0.zip', [
      estab({ b: '11222333', dv: '81', fant: 'SORRISO ODONTOLOGIA', ini: '20150310', cnae: '8630504', uf: 'SP', mun: '7107', d1: '11', t1: '33334444', d2: '11', t2: '987654321', email: 'contato@sorriso.com.br' }),
      estab({ b: '11222333', o: '0002', dv: '62', mf: '2', fant: 'SORRISO FILIAL', ini: '20210601', cnae: '8630504', uf: 'SP', mun: '7107', d1: '11', t1: '33335555' }),
      estab({ b: '22333444', sit: '08', fant: 'FECHADA', cnae: '8630504', uf: 'SP', mun: '7107', d1: '11', t1: '988887777' }),
      estab({ b: '44555666', fant: '', ini: '20230115', cnae: '8630504', uf: 'RJ', mun: '6001', d1: '21', t1: '999990000' }),
      estab({ b: '77888999', fant: 'PADARIA BOA', ini: '19990101', cnae: '1091102', uf: 'SP', mun: '7107' }),
      estab({ b: '55555555', fant: 'NO EXTERIOR', cnae: '8630504', uf: 'EX', mun: '9707' }),
    ].join('\n'))
    for (let i = 1; i <= 9; i++) zip(`Estabelecimentos${i}.zip`, '')
    zip('Empresas0.zip', [
      q('11222333', 'SORRISO ODONTOLOGIA LTDA', '2062', '49', '50000,00', '03', ''),
      q('44555666', 'ANA PAULA DENTISTA', '2135', '50', '1000,00', '01', ''),
      q('77888999', 'PADARIA BOA LTDA', '2062', '49', '20000,00', '01', ''),
      q('99999999', 'SEM ESTABELECIMENTO ATIVO', '2062', '49', '1,00', '01', ''),
    ].join('\n'))
    for (let i = 1; i <= 9; i++) zip(`Empresas${i}.zip`, '')
    zip('Simples.zip', [q('11222333', 'S', '20190101', '', 'N', '', ''), q('44555666', 'S', '20230115', '', 'S', '20230115', '')].join('\n'))

    const r = spawnSync(process.execPath, [path.join(__dirname, 'importer.js'), '--month', '2026-11', '--dir', dir, '--keep-zips'],
      { env: { ...process.env, CNPJ_PYTHON: process.env.CNPJ_PYTHON || 'python' }, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`importer falhou: ${r.stdout}\n${r.stderr}`)
    process.removeAllListeners('warning')
    const { DatabaseSync } = require('node:sqlite')
    db = new DatabaseSync(path.join(dir, 'cnpj.db'), { readOnly: true })
  }, 120_000)

  afterAll(() => { try { db?.close() } catch {} try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} })

  it('importa só ativas no Brasil e só empresas com estabelecimento ativo', () => {
    expect(S.status(db)).toMatchObject({ ready: true, competencia: '2026-11', estabelecimentos: 4 })
    expect(db.prepare('select count(*) n from empresas').get().n).toBe(3)
    expect(fs.existsSync(path.join(dir, 'cnpj.next.db'))).toBe(false) // trocou a base no fim
  })

  it('busca por setor e estado: celular primeiro, porte e Simples', () => {
    const r = S.search(db, { cnaes: [8630504], uf: 'SP' })
    expect(r.total).toBe(2)
    const matriz = r.results.find(x => x.company.matriz)
    expect(matriz).toMatchObject({
      name: 'Sorriso Odontologia', phone: '+5511987654321', phoneDisplay: '(11) 98765-4321', phone2: '+551133334444', mobile: true,
      email: 'contato@sorriso.com.br', city: 'Sao Paulo', state: 'SP', category: 'Atividade odontológica', cnpj: '11222333000181',
    })
    expect(matriz.company).toMatchObject({ razao_social: 'Sorriso Odontologia LTDA', porte: 'Pequeno porte', situacao: 'ATIVA', abertura: '2015-03-10', capital: 50000, simples: true, mei: false })
    expect(r.results[0].company.abertura > r.results[1].company.abertura).toBe(true) // mais novas primeiro
  })

  it('filtros: só matriz, só celular, MEI, sem nome fantasia usa a razão social', () => {
    expect(S.search(db, { cnaes: [8630504], uf: 'SP', matriz: true }).total).toBe(1)
    expect(S.search(db, { cnaes: [8630504], uf: 'SP', phone: 'mobile' }).results.map(x => x.name)).toEqual(['Sorriso Odontologia'])
    const mei = S.search(db, { cnaes: [8630504], mei: 'only' })
    expect(mei.results).toHaveLength(1)
    expect(mei.results[0]).toMatchObject({ name: 'Ana Paula Dentista', state: 'RJ', company: { porte: 'MEI' } })
    expect(S.search(db, { cnaes: [8630504], mei: 'exclude' }).total).toBe(2)
    expect(S.search(db, { cnaes: [8630504], portes: [3] }).total).toBe(2)
    expect(S.search(db, { cnaes: [8630504], minYears: 8 }).results.map(x => x.name)).toEqual(['Sorriso Odontologia']) // aberta em 2015
    expect(S.search(db, { cnaes: [8630504], maxYears: 4 }).results.map(x => x.name)).toEqual(['Ana Paula Dentista'])  // aberta em jan/2023 (< 4 anos)
  })

  it('cidade: por código, com ou sem setor; sem setor e sem cidade é recusado', () => {
    const [sp] = S.findCidades(db, 'são pau', 'SP')
    expect(sp).toMatchObject({ uf: 'SP', name: 'Sao Paulo', total: 3 })
    expect(S.search(db, { uf: 'SP', cidade: sp.code }).total).toBe(3)
    expect(S.search(db, { uf: 'SP', cidade: sp.code, phone: 'has' }).total).toBe(2)
    expect(S.search(db, { uf: 'SP' }).error).toMatch(/setor/)
  })

  it('setores por palavra (sem acento) ou pelo código', () => {
    expect(S.findCnaes(db, 'odontologica')[0]).toMatchObject({ code: 8630504, total: 3 })
    expect(S.findCnaes(db, 'padaria')[0].code).toBe(1091102)
    expect(S.findCnaes(db, '8630')[0].code).toBe(8630504)
    expect(S.findCnaes(db, 'xx')).toEqual([])
  })

  it('servidor consulta pela thread separada (e sem base responde "não pronta")', async () => {
    const load = (file) => {
      process.env.CNPJ_DB_PATH = file
      delete require.cache[require.resolve('./index')]
      return require('./index')
    }
    const api = load(path.join(dir, 'cnpj.db'))
    expect(await api.status()).toMatchObject({ ready: true, estabelecimentos: 4 })
    expect((await api.search({ cnaes: [8630504], uf: 'RJ' })).results[0].name).toBe('Ana Paula Dentista')
    expect((await api.cnaes('odonto'))[0].code).toBe(8630504)
    const none = load(path.join(dir, 'nao-existe.db'))
    expect(await none.status()).toEqual({ ready: false })
    expect(await none.search({ cnaes: [8630504] })).toMatchObject({ notReady: true })
    delete process.env.CNPJ_DB_PATH
  })

  it('filtros inválidos são limpos', () => {
    const f = S.normalize({ cnaes: ['8630504', 'abc', 12], uf: 'sp', cidade: '7107', portes: [1, 9], mei: 'talvez', limit: 999, offset: -4 })
    expect(f).toMatchObject({ cnaes: [8630504], uf: 'SP', cidade: 7107, portes: [1], mei: 'any', limit: S.MAX_LIMIT, offset: 0 })
    expect(S.normalize({ cidade: 7107 }).cidade).toBeNull() // cidade sem UF não vale (códigos se repetem entre estados? não, mas exige UF)
  })
})
