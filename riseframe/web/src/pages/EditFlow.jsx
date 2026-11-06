import React, { useMemo, useRef, useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';
import { analyzeReference } from '../api.js';
import {
  listProfiles, loadProfile, saveProfile, createProfile, deleteProfile, setActiveProfile, activeProfileId, addLearning,
} from '../editFlow.js';
import {
  activeQuestions, suggestFor, answerLabel, completeAnswers, planFlow, profileSummary, synthesizeReferences,
  LEARNING_PRESETS, applyLearning, FLOW_STAGES, DEFAULT_NOTE_OPEN, DEFAULT_NOTE_CLOSE,
} from '../../../shared/editFlow.js';

const PHASES = [
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'referencias', label: 'Referências' },
  { id: 'plano', label: 'Plano' },
  { id: 'caderno', label: 'Caderno' },
];
const MAX_REFS = 10;

const chip = (on) => ({
  border: on ? '2px solid #fff' : `1px solid ${C.border}`, borderRadius: 999, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  background: on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: on ? C.text : C.muted, fontWeight: on ? 700 : 500,
});
const btn = (primary) => ({
  border: primary ? 'none' : `1px solid ${C.borderStrong}`, borderRadius: 12, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  background: primary ? GRAD : 'rgba(255,255,255,0.05)', color: primary ? '#fff' : C.text,
});
const input = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', color: C.text, fontSize: 13.5, fontFamily: 'inherit' };
const label = { fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 };
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR');
const stageLabel = (id) => FLOW_STAGES.find((s) => s.id === id)?.label || (id === 'geral' ? 'Geral' : id);

function Box({ children, style }) {
  return <div style={{ ...glass({ padding: 20 }), ...style }}>{children}</div>;
}

/** Fase 0: o que é e o que vai acontecer. */
function Intro({ onStart }) {
  return (
    <Box style={{ maxWidth: 720 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Monte o seu jeito de editar</div>
      <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
        Em poucos minutos você diz como gosta dos seus vídeos e o Riseframe passa a editar <b>no seu estilo</b>, em todo vídeo novo.
        <ol style={{ margin: '12px 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
          <li><b>Entrevista:</b> onde você revisa, tipo de vídeo, ritmo do corte, animação, câmera e som. Cada pergunta já vem com uma sugestão.</li>
          <li><b>Referências:</b> você envia trechos de vídeos de que gosta e o Riseframe mede o ritmo e a câmera deles.</li>
          <li><b>Plano:</b> as etapas do seu fluxo, adaptadas a você.</li>
          <li><b>Caderno de aprendizados:</b> o que você corrigir nos vídeos vira ajuste do perfil, e cada vídeo sai melhor que o anterior.</li>
        </ol>
        Dá para parar e continuar depois: fica tudo salvo neste navegador. O perfil é seu, e você muda o que quiser quando quiser.
      </div>
      <button onClick={onStart} style={{ ...btn(true), marginTop: 16 }}>Começar</button>
    </Box>
  );
}

/** Fase 2: uma pergunta por vez, com a sugestão já dita. */
function Interview({ profile, onChange, onDone }) {
  const answers = profile.answers || {};
  const qs = activeQuestions(completeAnswers(answers));
  const step = Math.min(profile.montagem?.step || 0, qs.length); // qs.length = tela final (nome)
  const q = qs[step];
  const go = (n, patch = {}) => onChange({ ...profile, ...patch, montagem: { ...profile.montagem, step: n } });
  const pick = (id) => go(step, { answers: { ...answers, [q.id]: id } });

  if (!q) {
    return (
      <Box style={{ maxWidth: 720 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Quase lá: dê um nome a este estilo</div>
        <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 12 }}>Ex.: o nome do canal ou do cliente. Para outro canal, crie outro estilo depois.</div>
        <input value={profile.name} maxLength={60} onChange={(e) => onChange({ ...profile, name: e.target.value })} style={{ ...input, maxWidth: 360 }} />
        <div style={{ ...label, marginTop: 18 }}>SUAS RESPOSTAS</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {qs.map((x, i) => (
            <button key={x.id} onClick={() => go(i)} style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{x.title}</span><b style={{ color: C.text }}>{answerLabel(x.id, completeAnswers(answers)[x.id])}</b>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => go(step - 1)} style={btn(false)}>Voltar</button>
          <button onClick={onDone} style={btn(true)}>Seguir para as referências</button>
        </div>
      </Box>
    );
  }

  const sug = suggestFor(q.id, completeAnswers(answers));
  const cur = answers[q.id] || sug;
  return (
    <Box style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 6 }}>Pergunta {step + 1} de {qs.length}</div>
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }}>
        <div style={{ height: 4, borderRadius: 4, width: `${((step + 1) / qs.length) * 100}%`, background: GRAD, transition: 'width .2s' }} />
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700 }}>{q.title}</div>
      <div style={{ color: C.muted, fontSize: 13.5, margin: '6px 0 14px', lineHeight: 1.5 }}>{q.why}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {q.options.map((o) => {
          const on = cur === o.id;
          return (
            <button key={o.id} onClick={() => pick(o.id)} style={{ textAlign: 'left', border: on ? `2px solid ${C.orange}` : `1px solid ${C.border}`, background: on ? 'rgba(255,106,26,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit', color: C.text }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                {o.label}
                {o.id === sug && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.orangeSoft, border: `1px solid ${C.orangeSoft}`, borderRadius: 6, padding: '1px 6px' }}>SUGESTÃO</span>}
              </div>
              {o.hint && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{o.hint}</div>}
            </button>
          );
        })}
      </div>
      {q.id === 'notes' && cur === 'sim' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 14 }}>
          <div>
            <div style={label}>FRASE DE ABERTURA</div>
            <input value={answers.noteOpen ?? DEFAULT_NOTE_OPEN} maxLength={40} onChange={(e) => go(step, { answers: { ...answers, notes: 'sim', noteOpen: e.target.value } })} style={input} />
          </div>
          <div>
            <div style={label}>FRASE DE FECHAMENTO</div>
            <input value={answers.noteClose ?? DEFAULT_NOTE_CLOSE} maxLength={40} onChange={(e) => go(step, { answers: { ...answers, notes: 'sim', noteClose: e.target.value } })} style={input} />
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: C.faint }}>Ex.: “{answers.noteOpen || DEFAULT_NOTE_OPEN}, usa o take anterior, {answers.noteClose || DEFAULT_NOTE_CLOSE}”. Esqueceu de fechar? A nota vai só até o fim da frase.</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        {step > 0 && <button onClick={() => go(step - 1)} style={btn(false)}>Voltar</button>}
        <button onClick={() => go(step + 1, { answers: { ...answers, [q.id]: cur } })} style={btn(true)}>Próxima</button>
      </div>
    </Box>
  );
}

function RefMetrics({ m }) {
  if (!m) return null;
  const cam = m.camera || {};
  const curve = { linear: 'linear', out: 'suave na chegada', inout: 'suave nas duas pontas', back: 'passa do ponto' }[cam.curve];
  return (
    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
      Cena a cada <b style={{ color: C.text }}>{fmt1(m.avgShot)} s</b> ({fmt1(m.cutsPerMin)} cortes/min) · movimento na tela {fmt1((m.activity || 0) * 100)}%
      {cam.available
        ? <> · câmera se mexe {Math.round(cam.movingFraction * 100)}% do tempo, {fmt1(cam.punchesPerMin)} punch/min{cam.punchZoom > 0 ? ` (~${Math.round(cam.punchZoom * 100)}% em ${fmt1(cam.punchSeconds)} s)` : ''}, {fmt1(cam.pushesPerMin)} aproximação lenta/min{curve ? `, curva ${curve}` : ''}</>
        : <> · câmera não medida{cam.reason ? ` (${cam.reason})` : ''}</>}
    </div>
  );
}

/** Fase 3: referências → medidas → síntese → perfil. */
function References({ profile, onChange, onDone }) {
  const [busy, setBusy] = useState(null); // { name, pct }
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const refs = profile.references || [];
  const synth = useMemo(() => synthesizeReferences(refs), [refs]);

  async function add(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    setBusy({ name: f.name, pct: 0 });
    try {
      const metrics = await analyzeReference(f, (pct) => setBusy({ name: f.name, pct }));
      const next = loadProfile(profile.id) || profile;
      onChange({ ...next, references: [...(next.references || []), { id: `r${Date.now().toString(36)}`, name: f.name.slice(0, 80), note: '', metrics, analyzedAt: new Date().toISOString() }] });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(null);
    }
  }
  const setRef = (id, patch) => onChange({ ...profile, references: refs.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const removeRef = (id) => onChange({ ...profile, references: refs.filter((r) => r.id !== id) });
  function applySynth() {
    const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const rules = [...(profile.rules || []).filter((r) => !/^medido nas? refs?\b/.test(r.origin)), ...synth.rules.map((r) => ({ ...r, origin: `${r.origin} em ${date}` }))];
    onChange({ ...profile, answers: { ...profile.answers, ...synth.suggest }, rules, refsApplied: true });
  }

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 820 }}>
      <Box>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Vídeos que você gostaria de ter feito</div>
        <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.55 }}>
          Envie de 5 a 10 trechos curtos (5 a 30 s), de canais diferentes se quiser, e escreva em uma linha o que chamou sua atenção.
          O Riseframe mede o <b>jeito de mover</b> (ritmo dos cortes, câmera e movimento na tela). Ele nunca copia o desenho de ninguém.
          Sem referências o resultado fica no médio, mas dá para seguir e completar depois.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept="video/*" onChange={add} style={{ display: 'none' }} />
          <button disabled={!!busy || refs.length >= MAX_REFS} onClick={() => fileRef.current?.click()} style={{ ...btn(true), opacity: busy || refs.length >= MAX_REFS ? 0.5 : 1 }}>
            <Icon name="upload" size={14} color="#fff" /> Enviar referência
          </button>
          <span style={{ fontSize: 12.5, color: C.faint }}>{refs.length}/{MAX_REFS} · acima de 90 s, só o começo é medido</span>
        </div>
        {busy && <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}><Spinner size={13} /> {busy.pct < 0.6 ? 'Enviando' : 'Medindo'} “{busy.name}”… {Math.round(busy.pct * 100)}%</div>}
        {err && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{err}</div>}
      </Box>

      {refs.map((r, i) => (
        <Box key={r.id} style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ref {i + 1} · {r.name}</div>
            <button onClick={() => removeRef(r.id)} title="Tirar referência" aria-label="Tirar referência" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint }}><Icon name="trash" size={15} /></button>
          </div>
          <RefMetrics m={r.metrics} />
          <input value={r.note} maxLength={140} placeholder="O que chamou sua atenção? (ex.: a câmera que nunca para)" onChange={(e) => setRef(r.id, { note: e.target.value })} style={{ ...input, marginTop: 10 }} />
        </Box>
      ))}

      {synth.sentences.length > 0 && (
        <Box>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>O que suas referências têm em comum</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 14, lineHeight: 1.6 }}>{synth.sentences.map((s) => <li key={s}>{s}</li>)}</ul>
          <div style={{ ...label, marginTop: 14 }}>VIRA NO SEU PERFIL</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {synth.rules.map((r) => <div key={r.text} style={{ fontSize: 12.5, color: C.muted }}>• {r.text} <span style={{ color: C.faint }}>({r.origin})</span></div>)}
          </div>
          <div style={{ fontSize: 12.5, color: C.faint, marginTop: 10 }}>É tendência, não regra. Confira: está certo? Se não, aplique e ajuste a resposta na entrevista.</div>
          <button onClick={applySynth} style={{ ...btn(!profile.refsApplied), marginTop: 12 }}>{profile.refsApplied ? 'Aplicar de novo' : 'Aplicar ao meu perfil'}</button>
        </Box>
      )}

      <div><button onClick={onDone} style={btn(refs.length === 0 || profile.refsApplied)}>{refs.length ? 'Seguir para o plano' : 'Pular por agora'}</button></div>
    </div>
  );
}

/** Fase 4: o plano do fluxo + o que entra em todo vídeo novo. */
function Plan({ profile, onFinish, isActive }) {
  const stages = planFlow(profile.answers);
  const done = profile.montagem?.phase === 'pronto';
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 820 }}>
      {done && (
        <Box style={{ borderColor: 'rgba(46,212,122,0.35)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="check" size={16} color={C.green} /> Fluxo montado</div>
          <div style={{ color: C.muted, fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>
            Para editar, clique em <b>Criar vídeo</b>. {isActive ? <>O estilo <b>{profile.name}</b> já vem aplicado.</> : <>Ative este estilo acima para ele entrar nos vídeos novos.</>}
            {' '}Revisou um vídeo e quer algo diferente da próxima vez? Anote no <b>Caderno</b>.
          </div>
        </Box>
      )}
      <Box>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Seu fluxo, etapa por etapa</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {stages.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}` }}>
              <span style={{ width: 24, height: 24, borderRadius: 8, background: GRAD, color: '#fff', fontWeight: 800, fontSize: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {s.label}
                  {s.review && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.green, border: `1px solid ${C.green}`, borderRadius: 6, padding: '1px 6px' }}>VOCÊ APROVA AQUI</span>}
                </div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{s.line}</div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>No Riseframe: {s.tool}</div>
              </div>
            </div>
          ))}
        </div>
      </Box>
      <Box>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Em todo vídeo novo</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13.5, lineHeight: 1.65 }}>{profileSummary(profile).map((s) => <li key={s}>{s}</li>)}</ul>
        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 8 }}>Legenda, cores e logo continuam vindo do Brand Kit. Tudo pode ser mudado na hora de criar cada vídeo.</div>
        {(profile.rules || []).length > 0 && (
          <>
            <div style={{ ...label, marginTop: 14 }}>REGRAS DO PERFIL (COM A ORIGEM)</div>
            <div style={{ display: 'grid', gap: 4 }}>{profile.rules.map((r, i) => <div key={i} style={{ fontSize: 12.5, color: C.muted }}>• {r.text} <span style={{ color: C.faint }}>({r.origin})</span></div>)}</div>
          </>
        )}
      </Box>
      {!done && <div><button onClick={onFinish} style={btn(true)}>Aprovar e usar nos vídeos novos</button></div>}
    </div>
  );
}

/** O caderno de aprendizados: anotar não é mudar; aplicar é com o "sim" da pessoa. */
function Notebook({ profile, onChange }) {
  const [stage, setStage] = useState('cortes');
  const [text, setText] = useState('');
  const lines = profile.learnings || [];
  const open = lines.filter((l) => l.status === 'aberto');
  const appliable = open.filter((l) => l.preset);

  function note(preset) {
    const p = addLearning(profile.id, preset ? { stage: preset.stage, text: preset.text, preset: preset.id } : { stage, text });
    if (p) onChange(p, true);
    if (!preset) setText('');
  }
  function mark(id, status, appliedTo) {
    onChange({ ...profile, learnings: lines.map((l) => (l.id === id ? { ...l, status, appliedTo } : l)) });
  }
  function apply(list) {
    let p = profile;
    for (const l of list) {
      const r = applyLearning(p, l);
      p = { ...r.profile, learnings: (p.learnings || []).map((x) => (x.id === l.id ? r.learning : x)) };
    }
    onChange(p);
  }

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 820 }}>
      <Box>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Caderno de aprendizados</div>
        <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.55 }}>
          Revisou um vídeo? Anote o que vale <b>para os próximos</b> (“zoom mais sutil”, “esse som ficou ótimo”). Ajuste só daquele vídeo (“tira essa frase”) não entra.
          Anotar não muda nada: o perfil só muda quando você mandar aplicar.
        </div>
        <div style={{ ...label, marginTop: 14 }}>ANOTAR RÁPIDO</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LEARNING_PRESETS.map((p) => <button key={p.id} onClick={() => note(p)} style={chip(false)}>+ {p.text}</button>)}
        </div>
        <div style={{ ...label, marginTop: 14 }}>OU ESCREVA</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ ...input, width: 'auto' }}>
            {[...FLOW_STAGES.map((s) => s.id), 'geral'].map((id) => <option key={id} value={id}>{stageLabel(id)}</option>)}
          </select>
          <input value={text} maxLength={240} placeholder="O que você pediu, com contexto" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && note(null)} style={{ ...input, flex: 1, minWidth: 200 }} />
          <button disabled={!text.trim()} onClick={() => note(null)} style={{ ...btn(false), opacity: text.trim() ? 1 : 0.5 }}>Anotar</button>
        </div>
      </Box>

      <Box>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{open.length} anotado{open.length === 1 ? '' : 's'} para aplicar</div>
          {appliable.length > 0 && <button onClick={() => apply(appliable)} style={btn(true)}>Aplicar {appliable.length} ajuste{appliable.length === 1 ? '' : 's'} ao perfil</button>}
        </div>
        {!lines.length && <div style={{ fontSize: 13, color: C.faint }}>Nada anotado ainda.</div>}
        <div style={{ display: 'grid', gap: 6 }}>
          {[...lines].reverse().map((l) => (
            <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, opacity: l.status === 'aberto' ? 1 : 0.65 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: l.status === 'aplicado' ? C.green : C.faint }}>{l.status === 'aplicado' ? '[x]' : l.status === 'so-este' ? '[-]' : '[ ]'}</span>
              <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                <b>{stageLabel(l.stage)}</b> · {l.text} <span style={{ color: C.faint }}>· {new Date(l.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                {l.appliedTo && <div style={{ fontSize: 12, color: C.muted }}>→ {l.appliedTo}</div>}
              </div>
              {l.status === 'aberto' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {l.preset
                    ? <button onClick={() => apply([l])} style={chip(false)}>Aplicar</button>
                    : <button onClick={() => mark(l.id, 'aplicado', 'aplicado à mão')} style={chip(false)}>Já apliquei</button>}
                  <button onClick={() => mark(l.id, 'so-este', 'só daquele vídeo')} style={chip(false)}>Só daquele vídeo</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
}

export default function EditFlow({ onNewVideo }) {
  const [profiles, setProfiles] = useState(listProfiles);
  const [selId, setSelId] = useState(() => activeProfileId() || listProfiles()[0]?.id || '');
  const [activeId, setActiveId] = useState(activeProfileId);
  const [msg, setMsg] = useState('');
  const profile = profiles.find((p) => p.id === selId) || null;
  const phase = profile?.montagem?.phase || 'entrevista';
  const [tab, setTab] = useState(() => (phase === 'pronto' ? 'plano' : phase));

  function refresh() {
    setProfiles(listProfiles());
    setActiveId(activeProfileId());
  }
  function update(p, alreadySaved = false) {
    const saved = alreadySaved ? p : saveProfile(p);
    if (!saved) setMsg('Não deu para salvar (armazenamento do navegador cheio?)');
    refresh();
  }
  function setPhase(next) {
    if (!profile) return;
    update({ ...profile, montagem: { ...profile.montagem, phase: next } });
    setTab(next === 'pronto' ? 'plano' : next);
  }
  function start(copy) {
    const p = createProfile(copy ? profile : null);
    if (!p) return setMsg('Não deu para criar (armazenamento cheio)');
    refresh();
    setSelId(p.id);
    setTab(copy ? 'plano' : 'entrevista');
  }
  function select(id) {
    setSelId(id);
    const p = listProfiles().find((x) => x.id === id);
    const ph = p?.montagem?.phase || 'entrevista';
    setTab(ph === 'pronto' ? 'plano' : ph);
  }
  function remove() {
    if (!profile || !window.confirm(`Excluir o estilo “${profile.name}”?`)) return;
    deleteProfile(profile.id);
    const rest = listProfiles();
    refresh();
    select(rest[0]?.id || '');
  }
  function toggleActive() {
    setActiveProfile(activeId === profile.id ? '' : profile.id);
    refresh();
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 40px) 60px', display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700 }}>Meu fluxo de edição</div>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>O seu estilo de corte, animação, câmera e som, aplicado em todo vídeo novo.</div>
        </div>
        {profile && phase === 'pronto' && <button onClick={onNewVideo} style={btn(true)}><Icon name="plus" size={14} color="#fff" /> Criar vídeo</button>}
      </div>

      {!profiles.length ? <Intro onStart={() => start(false)} /> : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {profiles.map((p) => (
              <button key={p.id} onClick={() => select(p.id)} style={chip(p.id === selId)}>
                {p.name || 'Sem nome'}{p.id === activeId ? ' ●' : ''}
              </button>
            ))}
            <button onClick={() => start(false)} style={chip(false)}>+ Novo estilo</button>
            {profile && <button onClick={() => start(true)} style={chip(false)}>Duplicar</button>}
          </div>

          {profile && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: C.muted, cursor: phase === 'pronto' ? 'pointer' : 'default' }} title={phase === 'pronto' ? '' : 'Termine a montagem para usar nos vídeos'}>
                  <input type="checkbox" disabled={phase !== 'pronto'} checked={activeId === profile.id && phase === 'pronto'} onChange={toggleActive} />
                  Usar este estilo nos vídeos novos
                </label>
                <button onClick={remove} style={{ ...chip(false), marginLeft: 'auto' }}>Excluir estilo</button>
              </div>
              <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
                {PHASES.map((ph) => {
                  const on = tab === ph.id;
                  return (
                    <button key={ph.id} role="tab" aria-selected={on} onClick={() => setTab(ph.id)} style={{ background: 'none', border: 'none', borderBottom: on ? `2px solid ${C.orange}` : '2px solid transparent', color: on ? C.text : C.muted, fontWeight: on ? 700 : 500, fontSize: 14, padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {ph.label}{ph.id === 'caderno' && (profile.learnings || []).some((l) => l.status === 'aberto') ? ` (${profile.learnings.filter((l) => l.status === 'aberto').length})` : ''}
                    </button>
                  );
                })}
              </div>
              {tab === 'entrevista' && <Interview profile={profile} onChange={update} onDone={() => setPhase(phase === 'pronto' ? 'pronto' : 'referencias')} />}
              {tab === 'referencias' && <References profile={profile} onChange={update} onDone={() => setPhase(phase === 'pronto' ? 'pronto' : 'plano')} />}
              {tab === 'plano' && <Plan profile={profile} isActive={activeId === profile.id} onFinish={() => { setActiveProfile(profile.id); setPhase('pronto'); }} />}
              {tab === 'caderno' && <Notebook profile={profile} onChange={update} />}
            </>
          )}
        </>
      )}
      {msg && <div style={{ fontSize: 13, color: C.red }}>{msg}</div>}
    </div>
  );
}
