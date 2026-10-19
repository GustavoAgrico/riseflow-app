import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, GRAD } from '../theme.js';
import Icon from './Icon.jsx';
import { Spinner } from './ui.jsx';
import { addProjectMedia, createSequence, getJob, mediaFileUrl, mediaPreviewUrl, sourceUrl } from '../api.js';

const fmt = (s) => {
  const t = Math.max(0, Number(s) || 0);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
const clipLen = (c) => (c.kind === 'image' ? c.duration : Math.max(0.3, c.out - c.in));
const sig = (list) => JSON.stringify(list.map((c) => [c.mediaId || c.sourceId, c.kind, +(+c.in || 0).toFixed(2), +(+c.out || 0).toFixed(2), +(+c.duration || 0).toFixed(2)]));

/** Miniatura de uma mídia (imagem, quadro do vídeo ou ícone do áudio). */
export function MediaThumb({ it, at = 0.5, fit = 'cover' }) {
  const box = { width: '100%', height: '100%', objectFit: fit, display: 'block' };
  if (it.kind === 'image') return <img src={mediaFileUrl(it.mediaId || it.id)} alt="" loading="lazy" draggable={false} style={box} />;
  if (it.kind === 'video') {
    const src = it.sourceId ? sourceUrl(it.sourceId) : mediaPreviewUrl(it.mediaId || it.id);
    return <video src={`${src}#t=${Math.max(0.1, at)}`} preload="metadata" muted playsInline style={box} />;
  }
  return <div style={{ ...box, display: 'grid', placeItems: 'center' }}><Icon name="play" size={20} strokeWidth={1.8} color={C.purple} /></div>;
}

/**
 * Aba Projeto (como o painel Project/Bin + a trilha V1 do Premiere): todas as mídias da
 * conta (entram como CAMADA por cima ou no VÍDEO PRINCIPAL) e os clipes que formam o
 * vídeo principal — arraste para mudar a ordem, apare, tire ou acrescente. "Atualizar
 * vídeo principal" monta de novo e reabre o editor mantendo o estilo.
 */
export default function ProjectPanel({ library, onReloadLibrary, onAddLayer, sourceId, durationSec, projectTitle, options, carryStyle, onRebuild }) {
  const [clips, setClips] = useState(null);
  const [original, setOriginal] = useState('');
  const [music, setMusic] = useState(null);
  const [aspect, setAspect] = useState('auto');
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const dragKey = useRef(null);
  const key = () => `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  // O que forma o vídeo principal hoje: a montagem (timeline em branco) ou o vídeo enviado.
  useEffect(() => {
    let alive = true;
    getJob(sourceId).then((j) => {
      if (!alive) return;
      const seq = Array.isArray(j?.sequenceClips) && j.sequenceClips.length ? j.sequenceClips : null;
      const list = seq
        ? seq.map((c) => ({ ...c, key: key(), in: +c.in || 0, out: +c.out || 0, duration: +c.duration || 3 }))
        : [{ key: key(), sourceId, kind: 'video', filename: projectTitle || j?.filename || 'Vídeo enviado', in: 0, out: durationSec || j?.report?.input?.duration || 5, src: durationSec }];
      setClips(list);
      setOriginal(sig(list));
      if (j?.sequenceMusic?.mediaId) setMusic(j.sequenceMusic);
      if (j?.sequenceAspect) setAspect(j.sequenceAspect);
    }).catch(() => {
      if (!alive) return;
      const list = [{ key: key(), sourceId, kind: 'video', filename: projectTitle || 'Vídeo enviado', in: 0, out: durationSec || 5, src: durationSec }];
      setClips(list);
      setOriginal(sig(list));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const srcOf = (c) => c.src || (library || []).find((x) => x.id === c.mediaId)?.durationSec || c.out || 5;
  const changed = clips && (sig(clips) !== original);
  const total = useMemo(() => (clips || []).reduce((s, c) => s + clipLen(c), 0), [clips]);
  const selClip = (clips || []).find((c) => c.key === sel) || null;
  const update = (k, patch) => setClips((l) => l.map((c) => (c.key === k ? { ...c, ...patch } : c)));

  function addToV1(it) {
    if (it.kind === 'audio') { setMusic({ mediaId: it.id, filename: it.filename, volume: 0.35 }); return; }
    const c = { key: key(), mediaId: it.id, kind: it.kind, filename: it.filename, in: 0, out: it.kind === 'video' ? (Number(it.durationSec) || 5) : 0, duration: 3, src: Number(it.durationSec) || 0 };
    setClips((l) => [...(l || []), c]);
    setSel(c.key);
  }

  async function upload(files) {
    const list = Array.from(files || []);
    for (let i = 0; i < list.length; i++) {
      setBusy(`Enviando ${i + 1} de ${list.length}…`);
      try { await addProjectMedia(list[i]); } catch (e) { setError(`${list[i].name}: ${e.message}`); }
    }
    setBusy('');
    onReloadLibrary?.();
  }

  async function rebuild() {
    if (!clips?.length) return;
    if (!window.confirm('Atualizar o vídeo principal?\n\nO vídeo é montado de novo nessa ordem e a fala é transcrita de novo: cortes e ajustes feitos na legenda deste vídeo serão refeitos. O estilo (legenda, camadas, textos, cor, efeitos) continua.')) return;
    setError('');
    setBusy('Montando o vídeo principal…');
    try {
      const job = await createSequence({
        title: projectTitle || 'Timeline',
        aspect,
        options,
        clips: clips.map((c) => (c.sourceId
          ? { sourceId: c.sourceId, filename: c.filename, in: +c.in.toFixed(2), out: +c.out.toFixed(2) }
          : { mediaId: c.mediaId, ...(c.kind === 'video' ? { in: +c.in.toFixed(2), out: +c.out.toFixed(2) } : { duration: +c.duration.toFixed(2) }) })),
        ...(music?.mediaId ? { music: { mediaId: music.mediaId, volume: music.volume ?? 0.35 } } : {}),
      });
      carryStyle?.();
      onRebuild?.(job);
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  }

  const btn = (on) => ({ height: 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${on ? C.orange : C.border}`, background: on ? 'rgba(255,107,53,0.16)' : 'rgba(255,255,255,0.04)', color: on ? '#FFD2BF' : C.text, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' });
  const pps = Math.max(10, Math.min(60, 520 / Math.max(10, total)));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Mídias do projeto (o Bin do Premiere) */}
      <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="folder" size={15} strokeWidth={2} /></span>
          <b style={{ fontSize: 13 }}>Mídias do projeto</b>
          <span style={{ fontSize: 11.5, color: C.faint }}>{library ? `${library.length} item(ns)` : ''}</span>
          <input ref={fileRef} type="file" multiple accept="video/*,image/*,audio/*" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} style={{ ...btn(true), marginLeft: 'auto' }}>{busy && busy.startsWith('Enviando') ? busy : '+ Importar'}</button>
        </div>
        <div style={{ fontSize: 11, color: C.faint }}>Arraste arquivos para cá. Em cada mídia: <b>Camada</b> põe por cima do vídeo no ponto atual · <b>V1</b> põe no vídeo principal.</div>
        {library === null ? <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div> : library.length === 0 ? (
          <div style={{ fontSize: 12, color: C.faint }}>Nenhuma mídia ainda — importe vídeos, áudios e imagens.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8, maxHeight: 290, overflowY: 'auto' }}>
            {library.map((it) => (
              <div key={it.id} draggable={it.status === 'ok' && it.kind !== 'audio'} onDragStart={(e) => e.dataTransfer.setData('text/rf-media', it.id)} style={{ display: 'grid', gap: 3, opacity: it.status === 'ok' ? 1 : 0.4 }} title={it.filename}>
                <div style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: 7, overflow: 'hidden', background: '#0E0E14', border: `1px solid ${C.border}` }}>
                  <MediaThumb it={it} />
                  {it.durationSec ? <span style={{ position: 'absolute', right: 3, bottom: 3, fontSize: 9.5, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '0 4px' }}>{fmt(it.durationSec)}</span> : null}
                </div>
                <span style={{ fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.filename}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => it.status === 'ok' && onAddLayer?.(it)} disabled={it.status !== 'ok'} title="Por cima do vídeo, no ponto atual" style={{ ...btn(false), flex: 1, height: 24, padding: 0, fontSize: 10.5 }}>Camada</button>
                  <button onClick={() => it.status === 'ok' && addToV1(it)} disabled={it.status !== 'ok'} title={it.kind === 'audio' ? 'Música do vídeo principal' : 'No fim do vídeo principal (V1)'} style={{ ...btn(true), flex: 1, height: 24, padding: 0, fontSize: 10.5 }}>{it.kind === 'audio' ? '♪ V1' : '+ V1'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vídeo principal (V1): os clipes na ordem */}
      <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${changed ? C.orange : C.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { const id = e.dataTransfer.getData('text/rf-media'); const it = (library || []).find((x) => x.id === id); if (it) { e.preventDefault(); addToV1(it); } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: '#2D8CFF', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 800 }}>V1</span>
          <b style={{ fontSize: 13 }}>Vídeo principal</b>
          <span style={{ fontSize: 11.5, color: C.faint }}>{clips ? `${clips.length} clipe(s) · ${fmt(total)}` : ''}</span>
          <select value={aspect} onChange={(e) => setAspect(e.target.value)} title="Formato ao montar" style={{ marginLeft: 'auto', height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: '#16161F', color: C.text, fontSize: 11.5, fontFamily: 'inherit' }}>
            {[['auto', 'Formato do 1º clipe'], ['9:16', '9:16'], ['16:9', '16:9'], ['1:1', '1:1'], ['4:5', '4:5']].map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </div>
        {!clips ? <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div> : (
          <div style={{ display: 'flex', gap: 3, overflowX: 'auto', padding: '2px 0', minHeight: 54 }}>
            {clips.map((c, i) => (
              <div key={c.key} draggable onDragStart={(e) => { dragKey.current = c.key; e.dataTransfer.setData('text/rf-clip', c.key); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const from = dragKey.current;
                  dragKey.current = null;
                  if (!from || from === c.key) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setClips((l) => { const n = l.slice(); const [it] = n.splice(n.findIndex((x) => x.key === from), 1); n.splice(n.findIndex((x) => x.key === c.key), 0, it); return n; });
                }}
                onClick={() => setSel(c.key)} title={`${i + 1}. ${c.filename || ''} — arraste para mudar a ordem`}
                style={{ flex: 'none', width: Math.max(64, clipLen(c) * pps), height: 52, position: 'relative', borderRadius: 7, overflow: 'hidden', cursor: 'grab', border: sel === c.key ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)', background: c.kind === 'video' ? '#3B5BDB' : '#0E7490' }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.55 }}><MediaThumb it={c} at={c.in + 0.3} /></div>
                <span style={{ position: 'absolute', left: 5, top: 3, right: 5, fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 2px #000' }}>{i + 1}. {c.filename}</span>
                <span style={{ position: 'absolute', left: 5, bottom: 3, fontSize: 9.5, color: '#fff', textShadow: '0 1px 2px #000' }}>{fmt(clipLen(c))}</span>
              </div>
            ))}
          </div>
        )}
        {selClip && (
          <div style={{ display: 'grid', gap: 6, padding: 8, borderRadius: 9, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <b style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selClip.filename}</b>
              <button onClick={() => setClips((l) => { const i = l.findIndex((x) => x.key === sel); if (i < 1) return l; const n = l.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} style={btn(false)} title="Para a esquerda">◀</button>
              <button onClick={() => setClips((l) => { const i = l.findIndex((x) => x.key === sel); if (i < 0 || i >= l.length - 1) return l; const n = l.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} style={btn(false)} title="Para a direita">▶</button>
              <button onClick={() => { setClips((l) => l.filter((x) => x.key !== sel)); setSel(null); }} style={{ ...btn(false), color: C.red }}>Tirar</button>
            </div>
            {selClip.kind === 'video' ? [['in', 'Começa'], ['out', 'Termina']].map(([k, label]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted }}>
                <span style={{ width: 54 }}>{label}</span>
                <input type="range" min="0" max={Math.max(0.5, srcOf(selClip))} step="0.1" value={selClip[k]}
                  onChange={(e) => { const v = Number(e.target.value); update(selClip.key, k === 'in' ? { in: Math.min(v, selClip.out - 0.3) } : { out: Math.max(v, selClip.in + 0.3) }); }} style={{ flex: 1 }} />
                <span style={{ width: 36, textAlign: 'right' }}>{fmt(selClip[k])}</span>
              </label>
            )) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted }}>
                <span style={{ width: 54 }}>Duração</span>
                <input type="range" min="0.5" max="15" step="0.5" value={selClip.duration} onChange={(e) => update(selClip.key, { duration: Number(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ width: 36, textAlign: 'right' }}>{selClip.duration.toFixed(1)}s</span>
              </label>
            )}
          </div>
        )}
        {music && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span style={{ background: '#16A34A', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 800 }}>A2</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>♪ {music.filename}</span>
            <input type="range" min="0" max="1" step="0.05" value={music.volume ?? 0.35} onChange={(e) => setMusic((m) => ({ ...m, volume: Number(e.target.value) }))} style={{ width: 90 }} />
            <button onClick={() => setMusic(null)} style={{ ...btn(false), color: C.red }}>×</button>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#FCA5B4' }}>{error}</div>}
        <button onClick={rebuild} disabled={!changed || !!busy || !clips?.length}
          style={{ height: 36, borderRadius: 10, border: 'none', background: changed && !busy ? GRAD : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: changed && !busy ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {busy.startsWith('Montando') && <Spinner size={13} />} {changed ? 'Atualizar vídeo principal' : 'Mude a ordem, apare ou acrescente clipes para atualizar'}
        </button>
        <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>Ao atualizar, o vídeo principal é montado de novo e a fala transcrita de novo (conta como um vídeo novo). Estilo da legenda, camadas, textos, cor e efeitos continuam.</div>
      </div>
    </div>
  );
}
