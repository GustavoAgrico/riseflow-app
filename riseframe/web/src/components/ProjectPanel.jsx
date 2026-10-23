import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, GRAD } from '../theme.js';
import Icon from './Icon.jsx';
import { Spinner } from './ui.jsx';
import { addProjectMedia, createSequence, getJob, mediaFileUrl, mediaPreviewUrl, sourceUrl } from '../api.js';

const fmt = (s) => {
  const t = Math.max(0, Number(s) || 0);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
const clipLen = (c) => (c.kind === 'image' || c.kind === 'blank' ? c.duration : Math.max(0.3, c.out - c.in));
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
export default function ProjectPanel({ library, libraryAll = library, scopeBar = null, libScope = 'todos', onImported, onReloadLibrary, onAddLayer, onRemoveMedia = null, sourceId, durationSec, projectTitle, options, carryStyle, onRebuild, withClipWords = null }) {
  // clipes novos: transcrever já ou só colocar (a escolha fica lembrada)
  const [transcribeNew, setTranscribeNew] = useState(() => { try { return localStorage.getItem('rf_transcribe_new') === '1'; } catch { return false; } });
  const [clips, setClips] = useState(null);
  const [original, setOriginal] = useState('');
  const [music, setMusic] = useState(null);
  const [aspect, setAspect] = useState('auto');
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const dragKey = useRef(null);
  // Bin: ver em grade (miniaturas grandes) ou lista; marcar vários para excluir/pôr na V1
  const [view, setView] = useState(() => { try { return localStorage.getItem('rf_bin_view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });
  const setViewKeep = (v) => { setView(v); try { localStorage.setItem('rf_bin_view', v); } catch { /* sem armazenamento */ } };
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState([]);
  const lastPick = useRef(null);
  const shown = library || [];
  function togglePick(id, e) {
    setPicking(true);
    if (e?.shiftKey && lastPick.current) {
      const ids = shown.map((x) => x.id);
      const a = ids.indexOf(lastPick.current);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) { setPicked((p) => [...new Set([...p, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)])]); return; }
    }
    lastPick.current = id;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  const endPick = () => { setPicking(false); setPicked([]); lastPick.current = null; };
  async function removePicked(ids) {
    if (!onRemoveMedia || !ids.length) return;
    await onRemoveMedia(ids);
    setPicked((p) => p.filter((x) => !ids.includes(x)));
  }
  const key = () => `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  // O que forma o vídeo principal hoje: a montagem (timeline em branco) ou o vídeo enviado.
  useEffect(() => {
    let alive = true;
    getJob(sourceId).then((j) => {
      if (!alive) return;
      // timeline montada (ou em branco: lista vazia) → os clipes dela; senão o vídeo enviado
      const seq = j?.fromSequence && Array.isArray(j.sequenceClips) ? j.sequenceClips : null;
      // srcAt/in0: onde cada clipe está no vídeo de hoje (a fala dele vai junto ao atualizar)
      let at = 0;
      const list = seq
        ? seq.map((c) => { const it = { ...c, key: key(), in: +c.in || 0, out: +c.out || 0, duration: +c.duration || 3 }; it.srcAt = at; it.in0 = it.in; at += clipLen(it); return it; })
        : [{ key: key(), sourceId, kind: 'video', filename: projectTitle || j?.filename || 'Vídeo enviado', in: 0, out: durationSec || j?.report?.input?.duration || 5, src: durationSec, srcAt: 0, in0: 0 }];
      setClips(list);
      setOriginal(sig(list));
      if (j?.sequenceMusic?.mediaId) setMusic(j.sequenceMusic);
      if (j?.sequenceAspect && !j.blankTimeline) setAspect(j.sequenceAspect);
    }).catch(() => {
      if (!alive) return;
      const list = [{ key: key(), sourceId, kind: 'video', filename: projectTitle || 'Vídeo enviado', in: 0, out: durationSec || 5, src: durationSec, srcAt: 0, in0: 0 }];
      setClips(list);
      setOriginal(sig(list));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const srcOf = (c) => c.src || (libraryAll || []).find((x) => x.id === c.mediaId)?.durationSec || c.out || 5;
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
      try { const info = await addProjectMedia(list[i]); onImported?.(info?.id); } catch (e) { setError(`${list[i].name}: ${e.message}`); }
    }
    setBusy('');
    onReloadLibrary?.();
  }

  async function rebuild() {
    if (!clips?.length) return;
    const novos = clips.some((c) => c.kind === 'video' && c.srcAt == null);
    if (!window.confirm(`Atualizar o vídeo principal?\n\nO vídeo é montado de novo nessa ordem. A fala que já estava transcrita é reaproveitada${novos ? (transcribeNew ? '; só os clipes novos são transcritos' : '; os clipes novos entram sem transcrever (depois, selecione o trecho e use "Transcrever trecho")') : ''}. O estilo (legenda, camadas, textos, cor, efeitos) continua.`)) return;
    setError('');
    setBusy('Montando o vídeo principal…');
    try {
      const job = await createSequence({
        title: projectTitle || 'Timeline',
        aspect,
        options,
        ...(transcribeNew ? {} : { transcribeNew: false }),
        clips: (withClipWords || ((_, o) => o))(clips, clips.map((c) => (c.kind === 'blank' ? { blank: true, duration: +c.duration.toFixed(2) } : c.sourceId
          ? { sourceId: c.sourceId, filename: c.filename, in: +c.in.toFixed(2), out: +c.out.toFixed(2) }
          : { mediaId: c.mediaId, ...(c.kind === 'video' ? { in: +c.in.toFixed(2), out: +c.out.toFixed(2) } : { duration: +c.duration.toFixed(2) }) }))),
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
          {scopeBar}
          <input ref={fileRef} type="file" multiple accept="video/*,image/*,audio/*" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} style={{ ...btn(true), marginLeft: 'auto' }}>{busy && busy.startsWith('Enviando') ? busy : '+ Importar'}</button>
        </div>
        <div style={{ fontSize: 11, color: C.faint }}>Arraste arquivos para cá. Em cada mídia: <b>Camada</b> põe por cima do vídeo no ponto atual · <b>V1</b> põe no vídeo principal · ou arraste a mídia direto para a faixa V1 da timeline.</div>
        {library && library.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div role="group" aria-label="Ver como" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}` }}>
              {[['grid', '▦ Grade'], ['list', '☰ Lista']].map(([v, l]) => (
                <button key={v} onClick={() => setViewKeep(v)} aria-pressed={view === v}
                  style={{ height: 24, padding: '0 9px', borderRadius: 6, border: 'none', background: view === v ? 'rgba(255,255,255,0.14)' : 'transparent', color: view === v ? C.text : C.muted, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
            {!picking ? (
              <button onClick={() => setPicking(true)} title="Marcar várias mídias para excluir ou pôr na V1 (ou Ctrl/Shift + clique)" style={btn(false)}>☐ Selecionar</button>
            ) : (
              <>
                <span style={{ fontSize: 11, color: C.muted }}>{picked.length} selecionada(s)</span>
                <button onClick={() => setPicked(picked.length === shown.length ? [] : shown.map((x) => x.id))} style={btn(false)}>{picked.length === shown.length ? 'Nenhuma' : 'Todas'}</button>
                <button onClick={() => { shown.filter((x) => picked.includes(x.id) && x.status === 'ok').sort((x, y) => picked.indexOf(x.id) - picked.indexOf(y.id)).forEach((it) => addToV1(it)); endPick(); }} disabled={!picked.length} style={{ ...btn(true), opacity: picked.length ? 1 : 0.5 }}>+ V1 ({picked.length})</button>
                {onRemoveMedia && <button onClick={() => removePicked(picked)} disabled={!picked.length} style={{ ...btn(false), color: picked.length ? C.red : C.faint, borderColor: picked.length ? C.red : C.border }}>Excluir ({picked.length})</button>}
                <button onClick={endPick} style={{ ...btn(false), border: 'none', background: 'transparent', color: C.muted }}>Cancelar</button>
              </>
            )}
          </div>
        )}
        {library === null ? <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div> : library.length === 0 ? (
          <div style={{ fontSize: 12, color: C.faint }}>{libScope === 'projeto' && libraryAll?.length ? 'Nenhum arquivo deste projeto ainda — importe aqui ou veja em Todos os que você já enviou.' : 'Nenhuma mídia ainda — importe vídeos, áudios e imagens.'}</div>
        ) : (
          <div style={view === 'list'
            ? { display: 'grid', gap: 2, maxHeight: 290, overflowY: 'auto' }
            : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8, maxHeight: 290, overflowY: 'auto' }}>
            {library.map((it) => {
              const on = picked.includes(it.id);
              const ok = it.status === 'ok';
              const onDrag = (e) => {
                e.dataTransfer.setData('text/rf-media', it.id);
                // arrastou uma das marcadas: vão todas (na ordem em que foram marcadas)
                const ids = on && picked.length > 1 ? picked.filter((id) => shown.some((x) => x.id === id)) : [it.id];
                e.dataTransfer.setData('text/rf-media-list', JSON.stringify(ids));
                e.dataTransfer.effectAllowed = 'copy';
              };
              const pickClick = (e) => { if (picking || e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); togglePick(it.id, e); } };
              const check = picking && (
                <span aria-hidden="true" style={{ position: 'absolute', left: 4, top: 4, width: 16, height: 16, borderRadius: 4, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, background: on ? C.orange : 'rgba(0,0,0,0.6)', border: on ? 'none' : '1.5px solid rgba(255,255,255,0.75)', color: '#fff', pointerEvents: 'none' }}>{on ? '✓' : ''}</span>
              );
              const del = onRemoveMedia && !picking && (
                <button onClick={(e) => { e.stopPropagation(); removePicked([it.id]); }} title="Tirar da biblioteca" aria-label={`Tirar ${it.filename} da biblioteca`}
                  style={view === 'list'
                    ? { width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: 'none', background: 'transparent', color: C.faint, fontSize: 14, cursor: 'pointer', padding: 0 }
                    : { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 5, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>
              );
              const actions = (
                <>
                  <button onClick={() => ok && onAddLayer?.(it)} disabled={!ok} title="Por cima do vídeo, no ponto atual" style={{ ...btn(false), flex: view === 'list' ? 'none' : 1, height: 24, padding: view === 'list' ? '0 8px' : 0, fontSize: 10.5 }}>Camada</button>
                  <button onClick={() => ok && addToV1(it)} disabled={!ok} title={it.kind === 'audio' ? 'Música do vídeo principal' : 'No fim do vídeo principal (V1)'} style={{ ...btn(true), flex: view === 'list' ? 'none' : 1, height: 24, padding: view === 'list' ? '0 8px' : 0, fontSize: 10.5 }}>{it.kind === 'audio' ? '♪ V1' : '+ V1'}</button>
                </>
              );
              if (view === 'list') {
                return (
                  <div key={it.id} draggable={ok} onDragStart={onDrag} onClickCapture={pickClick} title={it.filename}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 7, opacity: ok ? 1 : 0.4, background: on ? 'rgba(255,107,53,0.14)' : 'transparent', border: `1px solid ${on ? C.orange : 'transparent'}`, cursor: picking ? 'pointer' : 'default' }}>
                    <div style={{ position: 'relative', width: 54, height: 32, flexShrink: 0, borderRadius: 5, overflow: 'hidden', background: '#0E0E14', border: `1px solid ${C.border}` }}>
                      <MediaThumb it={it} />{check}
                    </div>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.filename}</span>
                    <span style={{ fontSize: 10.5, color: C.faint, width: 64, textAlign: 'right', flexShrink: 0 }}>{it.kind === 'video' ? 'vídeo' : it.kind === 'image' ? 'imagem' : 'áudio'}{it.durationSec ? ` · ${fmt(it.durationSec)}` : ''}</span>
                    {!picking && actions}
                    {del}
                  </div>
                );
              }
              return (
                <div key={it.id} draggable={ok} onDragStart={onDrag} onClickCapture={pickClick} style={{ display: 'grid', gap: 3, opacity: ok ? 1 : 0.4, cursor: picking ? 'pointer' : 'default' }} title={it.filename}>
                  <div style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: 7, overflow: 'hidden', background: '#0E0E14', border: on ? `2px solid ${C.orange}` : `1px solid ${C.border}` }}>
                    <MediaThumb it={it} />
                    {it.durationSec ? <span style={{ position: 'absolute', right: 3, bottom: 3, fontSize: 9.5, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '0 4px' }}>{fmt(it.durationSec)}</span> : null}
                    {check}
                    {del}
                  </div>
                  <span style={{ fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.filename}</span>
                  {!picking && <div style={{ display: 'flex', gap: 4 }}>{actions}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Vídeo principal (V1): os clipes na ordem */}
      <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${changed ? C.orange : C.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { const id = e.dataTransfer.getData('text/rf-media'); const it = (libraryAll || []).find((x) => x.id === id); if (it) { e.preventDefault(); addToV1(it); } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: '#2D8CFF', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 800 }}>V1</span>
          <b style={{ fontSize: 13 }}>Vídeo principal</b>
          <span style={{ fontSize: 11.5, color: C.faint }}>{clips ? `${clips.length} clipe(s) · ${fmt(total)}` : ''}</span>
          <select value={aspect} onChange={(e) => setAspect(e.target.value)} title="Formato ao montar" style={{ marginLeft: 'auto', height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: '#16161F', color: C.text, fontSize: 11.5, fontFamily: 'inherit' }}>
            {[['auto', 'Formato do 1º clipe'], ['9:16', '9:16'], ['16:9', '16:9'], ['1:1', '1:1'], ['4:5', '4:5']].map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </div>
        {clips && !clips.length && (
          <div style={{ padding: '14px 10px', borderRadius: 9, border: `1.5px dashed ${C.border}`, fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
            A timeline está vazia. Toque em <b style={{ color: C.text }}>+ V1</b> nas mídias acima (ou arraste uma mídia para cá) e depois em <b style={{ color: C.text }}>Atualizar vídeo principal</b>.
          </div>
        )}
        {!clips ? <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div> : !clips.length ? null : (
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
                <div style={{ position: 'absolute', inset: 0, opacity: 0.55 }}>{c.kind === 'blank' ? <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(135deg, #0b0b0f, #0b0b0f 6px, #16161d 6px, #16161d 12px)' }} /> : <MediaThumb it={c} at={c.in + 0.3} />}</div>
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
                <input type="range" min="0.5" max={Math.max(15, Math.ceil(selClip.duration))} step="0.5" value={selClip.duration} onChange={(e) => update(selClip.key, { duration: Number(e.target.value) })} style={{ flex: 1 }} />
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={transcribeNew} onChange={(e) => { setTranscribeNew(e.target.checked); try { localStorage.setItem('rf_transcribe_new', e.target.checked ? '1' : '0'); } catch { /* sem armazenamento */ } }} />
          Transcrever a fala dos clipes novos agora (legenda, pausas, erros)
        </label>
        <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>Ao atualizar, o vídeo principal é montado de novo e a fala que já estava transcrita é reaproveitada. Sem a opção acima, os clipes novos entram sem transcrever: depois, selecione o trecho na timeline e use <b>Transcrever trecho</b>. Estilo da legenda, camadas, textos, cor e efeitos continuam.</div>
      </div>
    </div>
  );
}
