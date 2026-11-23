import { useEffect, useRef, useState } from 'react';
import { C } from '../theme.js';
import { getMotionRefs, addMotionRef, removeMotionRef, learnMotionRefs } from '../api.js';

// Referências de motion: a pasta com vídeos/imagens de motions de que a pessoa gosta. O Claude
// olha quadros delas e aprende um guia de estilo; o motion "Premium com IA" e o motion por
// prompt seguem esse guia.

const btn = (primary) => ({
  height: 28, padding: '0 11px', borderRadius: 8, border: `1px solid ${primary ? C.orange : C.border}`,
  background: primary ? 'rgba(255,107,53,0.16)' : 'transparent', color: C.text, fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
});

export default function MotionRefsPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const inputRef = useRef(null);
  const desktop = typeof window !== 'undefined' && window.electron?.openMotionRefs;

  const load = () => getMotionRefs().then(setData).catch((e) => setNote(e.message));
  useEffect(() => { load(); }, []);

  async function add(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    setBusy('add');
    try {
      for (let i = 0; i < list.length; i++) {
        setNote(`Enviando ${i + 1} de ${list.length}…`);
        // eslint-disable-next-line no-await-in-loop
        await addMotionRef(list[i]);
      }
      setNote(`${list.length} referência(s) na pasta. Clique em "Aprender o estilo".`);
      await load();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy('');
    }
  }
  async function learn() {
    setBusy('learn');
    setNote('O Claude está olhando as referências (quadros e movimento)… leva 1–2 min.');
    try {
      await learnMotionRefs();
      setNote('Estilo aprendido — o "Premium com IA" e o motion por prompt já seguem esse guia.');
      await load();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy('');
    }
  }
  async function remove(name) {
    await removeMotionRef(name).catch((e) => setNote(e.message));
    load();
  }
  async function openFolder() {
    const r = await window.electron.openMotionRefs();
    setNote(r?.ok ? 'Solte seus vídeos e imagens na pasta que abriu e clique em Atualizar.' : `Não abriu a pasta (${r?.error || 'erro'})`);
  }

  const g = data?.guide;
  return (
    <div style={{ display: 'grid', gap: 7, padding: 9, borderRadius: 9, border: `1px dashed ${C.borderStrong}`, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12 }}>📁 Referências de motion</b>
        <span style={{ fontSize: 10.5, color: C.faint }}>o Claude aprende o seu estilo</span>
      </div>
      <span style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.4 }}>
        Coloque vídeos e imagens de motions que você gostaria de ter (prints, Reels baixados, trabalhos de referência). O Claude olha os quadros e o movimento e monta o guia de estilo: cores, fontes, efeitos, ritmo e câmera.
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <button type="button" style={btn(false)} disabled={Boolean(busy)} onClick={() => inputRef.current?.click()}>+ Adicionar vídeos/imagens</button>
        {desktop && <button type="button" style={btn(false)} onClick={openFolder}>Abrir a pasta</button>}
        <button type="button" style={btn(false)} onClick={load} disabled={Boolean(busy)}>Atualizar</button>
        <button type="button" style={btn(true)} disabled={Boolean(busy) || !data?.files?.length || data?.canLearn === false} onClick={learn}
          title={data?.canLearn === false ? 'Precisa da chave do Claude (ANTHROPIC_API_KEY)' : ''}>
          {busy === 'learn' ? 'Aprendendo…' : g ? 'Aprender de novo' : 'Aprender o estilo'}
        </button>
        <input ref={inputRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {data?.files?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {data.files.map((f) => (
            <span key={f.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 170, fontSize: 10.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 4px 2px 8px' }}>
              <span>{f.kind === 'video' ? '🎬' : '🖼️'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button type="button" aria-label={`Tirar ${f.name}`} onClick={() => remove(f.name)} style={{ border: 'none', background: 'transparent', color: C.faint, cursor: 'pointer', fontSize: 11 }}>✕</button>
            </span>
          ))}
        </div>
      )}
      {data && !data.files?.length && <span style={{ fontSize: 10.5, color: C.faint }}>Pasta vazia{desktop ? ' — use "Abrir a pasta" ou "Adicionar"' : ''}.</span>}
      {data?.canLearn === false && <span style={{ fontSize: 10.5, color: '#FCD34D' }}>Aprender o estilo precisa da chave do Claude (ANTHROPIC_API_KEY) neste servidor.</span>}
      {g && (
        <div style={{ display: 'grid', gap: 4, padding: 7, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 700 }}>SEU ESTILO</span>
            {Object.values(g.palette || {}).map((c, i) => <span key={i} title={c} style={{ width: 12, height: 12, borderRadius: 999, background: c, border: '1px solid rgba(255,255,255,0.3)' }} />)}
          </div>
          <span style={{ fontSize: 11, color: C.text, lineHeight: 1.4 }}>{g.summary}</span>
          {g.rules?.length > 0 && <span style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.4 }}>{g.rules.slice(0, 4).join(' · ')}</span>}
        </div>
      )}
      {note && <span role="status" style={{ fontSize: 11, color: C.text }}>{note}</span>}
      {desktop && data?.folder && <span style={{ fontSize: 10, color: C.faint, wordBreak: 'break-all' }}>Pasta: {data.folder}</span>}
    </div>
  );
}
