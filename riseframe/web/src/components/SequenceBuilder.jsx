import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, GRAD } from '../theme.js';
import Icon from './Icon.jsx';
import { Spinner } from './ui.jsx';
import { addProjectMedia, createSequence, getMediaLibrary, mediaFileUrl, mediaPreviewUrl } from '../api.js';

const fmt = (s) => {
  const t = Math.max(0, Number(s) || 0);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}${t < 60 ? `.${Math.floor((t % 1) * 10)}` : ''}`;
};
const clipLen = (c) => (c.kind === 'image' ? c.duration : Math.max(0.3, c.out - c.in));
const FORMATS = [['auto', 'Do 1º clipe'], ['9:16', '9:16 Reels'], ['16:9', '16:9 YouTube'], ['1:1', '1:1'], ['4:5', '4:5 Feed']];

/**
 * Timeline em branco (como o Premiere): painel de MÍDIAS do projeto (sobe vídeos, áudios e
 * imagens, e tudo o que já subiu fica guardado) + monitor + trilha V1 (os clipes viram o
 * vídeo principal, um depois do outro) + trilha de música. "Ir para a edição" monta tudo
 * num vídeo e abre o editor completo (legenda, cortes, camadas, B-roll…).
 */
export default function SequenceBuilder({ options, onStart, onCancel }) {
  const [lib, setLib] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [clips, setClips] = useState([]);
  const [music, setMusic] = useState(null);
  const [sel, setSel] = useState(null);
  const [title, setTitle] = useState('');
  const [aspect, setAspect] = useState('auto');
  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const imgTimer = useRef(null);
  const dragKey = useRef(null);

  const loadLib = () => getMediaLibrary().then(setLib).catch(() => setLib((l) => l || []));
  useEffect(() => { loadLib(); }, []);

  const total = useMemo(() => clips.reduce((s, c) => s + clipLen(c), 0), [clips]);
  const selClip = clips.find((c) => c.key === sel) || null;
  const shown = playing ? clips[playIdx] : selClip || clips[0] || null;

  async function upload(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setError('');
    for (let i = 0; i < list.length; i++) {
      setBusy(`Enviando ${i + 1} de ${list.length}…`);
      try {
        const info = await addProjectMedia(list[i]);
        // vídeo/imagem enviado agora já entra na trilha; música vira a trilha de áudio
        if (info.kind === 'audio') setMusic({ ...info, volume: 0.35 });
        else add(info);
      } catch (e) {
        setError(`${list[i].name}: ${e.message}`);
      }
    }
    setBusy('');
    loadLib();
  }

  function add(it) {
    if (it.kind === 'audio') { setMusic({ ...it, volume: music?.volume ?? 0.35 }); return; }
    const d = Number(it.durationSec) || 0;
    const c = { key: `${it.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, mediaId: it.id, kind: it.kind, filename: it.filename, src: d, in: 0, out: it.kind === 'video' ? (d || 5) : 0, duration: 3 };
    setClips((l) => [...l, c]);
    setSel(c.key);
  }
  const update = (key, patch) => setClips((l) => l.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const move = (key, dir) => setClips((l) => {
    const i = l.findIndex((c) => c.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.length) return l;
    const n = l.slice();
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const remove = (key) => { setClips((l) => l.filter((c) => c.key !== key)); if (sel === key) setSel(null); };

  // Monitor: mostra o clipe selecionado; "Tocar timeline" passa por todos na ordem.
  useEffect(() => {
    const v = videoRef.current;
    clearTimeout(imgTimer.current);
    if (!shown) return undefined;
    if (shown.kind === 'video' && v) {
      v.currentTime = shown.in;
      if (playing) v.play().catch(() => {});
      else v.pause();
    } else if (shown.kind === 'image' && playing) {
      imgTimer.current = setTimeout(next, shown.duration * 1000);
    }
    return () => clearTimeout(imgTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.key, shown?.in, playing, playIdx]);
  function next() {
    setPlayIdx((i) => {
      if (i + 1 >= clips.length) { setPlaying(false); return 0; }
      return i + 1;
    });
  }
  function onTime(e) {
    const v = e.currentTarget;
    if (shown?.kind === 'video' && v.currentTime >= shown.out - 0.05) {
      if (playing) next();
      else v.pause();
    }
  }
  function togglePlay() {
    if (playing) { setPlaying(false); videoRef.current?.pause(); return; }
    if (!clips.length) return;
    setPlayIdx(Math.max(0, clips.findIndex((c) => c.key === sel)));
    setPlaying(true);
  }

  async function go() {
    if (!clips.length || busy) return;
    setError('');
    setBusy('Montando a timeline…');
    try {
      const job = await createSequence({
        title: title.trim() || 'Timeline',
        aspect,
        options,
        clips: clips.map((c) => ({ mediaId: c.mediaId, ...(c.kind === 'video' ? { in: +c.in.toFixed(2), out: +c.out.toFixed(2) } : { duration: +c.duration.toFixed(2) }) })),
        ...(music ? { music: { mediaId: music.id, volume: music.volume } } : {}),
      });
      onStart?.(job);
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  }

  // Drag and drop: arquivos do computador → sobe; item do painel → entra na trilha.
  function onDropTimeline(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) { upload(e.dataTransfer.files); return; }
    const id = e.dataTransfer.getData('text/rf-media');
    const it = (lib || []).find((x) => x.id === id);
    if (it) add(it);
  }

  const pps = Math.max(18, Math.min(120, 900 / Math.max(10, total)));
  const panel = { border: `1px solid ${C.border}`, borderRadius: 14, background: 'rgba(255,255,255,0.025)' };
  const btn = (on) => ({ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${on ? C.orange : C.border}`, background: on ? 'rgba(255,107,53,0.16)' : 'rgba(255,255,255,0.04)', color: on ? '#FFD2BF' : C.text, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Timeline em branco</div>
          <div style={{ fontSize: 13, color: C.muted }}>Suba seus vídeos, imagens e músicas, monte a sequência e vá para a edição.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do projeto" maxLength={80}
            style={{ height: 36, minWidth: 200, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 13.5, fontFamily: 'inherit' }} />
          <select value={aspect} onChange={(e) => setAspect(e.target.value)} title="Formato do vídeo"
            style={{ height: 36, padding: '0 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#16161F', color: C.text, fontSize: 13, fontFamily: 'inherit' }}>
            {FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          {onCancel && <button onClick={onCancel} style={{ ...btn(false), height: 36 }}>Voltar</button>}
          <button onClick={go} disabled={!clips.length || !!busy}
            style={{ height: 38, padding: '0 18px', borderRadius: 11, border: 'none', background: clips.length && !busy ? GRAD : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: clips.length && !busy ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {busy && busy.startsWith('Montando') ? <Spinner size={14} /> : <Icon name="film" size={15} strokeWidth={2} />} Ir para a edição →
          </button>
        </div>
      </div>
      {error && <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, color: '#FCA5B4', fontSize: 13 }}>{error}</div>}

      <div className="rf-seq-top" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 14 }}>
        {/* Painel de mídias do projeto (o "Project/Bin" do Premiere) */}
        <div style={{ ...panel, padding: 12, display: 'grid', gap: 10, alignContent: 'start', maxHeight: 460, overflow: 'hidden' }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 13.5 }}>Mídias do projeto</b>
            <span style={{ fontSize: 11.5, color: C.faint }}>{lib ? `${lib.length} arquivo(s)` : ''}</span>
          </div>
          <input ref={fileRef} type="file" multiple accept="video/*,image/*,audio/*" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={!!busy}
            style={{ height: 40, borderRadius: 10, border: `1.5px dashed ${C.orange}`, background: 'rgba(255,107,53,0.08)', color: '#FFD2BF', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer' }}>
            {busy && !busy.startsWith('Montando') ? busy : '+ Importar vídeos, áudios e imagens'}
          </button>
          <div style={{ fontSize: 11, color: C.faint }}>Arraste arquivos para cá · clique ou arraste uma mídia para a trilha. Tudo fica guardado na sua biblioteca.</div>
          <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, paddingRight: 2 }}>
            {lib === null && <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div>}
            {lib?.map((it) => (
              <button key={it.id} draggable={it.status === 'ok'} onDragStart={(e) => e.dataTransfer.setData('text/rf-media', it.id)}
                onClick={() => it.status === 'ok' && add(it)} disabled={it.status !== 'ok'} title={`${it.filename}${it.kind === 'audio' ? ' — usar como música' : ' — pôr no fim da trilha'}`}
                style={{ display: 'grid', gap: 4, padding: 0, border: 'none', background: 'none', color: C.text, cursor: it.status === 'ok' ? 'pointer' : 'not-allowed', opacity: it.status === 'ok' ? 1 : 0.4, textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: 8, overflow: 'hidden', background: '#0E0E14', border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center' }}>
                  {it.kind === 'image' ? <img src={mediaFileUrl(it.id)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : it.kind === 'video' ? <video src={`${mediaPreviewUrl(it.id)}#t=0.5`} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Icon name="play" size={20} strokeWidth={1.8} color={C.purple} />}
                  {it.durationSec ? <span style={{ position: 'absolute', right: 4, bottom: 4, fontSize: 10, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '1px 4px' }}>{fmt(it.durationSec)}</span> : null}
                  <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 9.5, fontWeight: 800, background: it.kind === 'video' ? C.orange : it.kind === 'audio' ? C.purple : '#0891B2', borderRadius: 4, padding: '1px 5px' }}>{it.kind === 'video' ? 'VÍDEO' : it.kind === 'audio' ? 'ÁUDIO' : 'IMAGEM'}</span>
                </div>
                <span style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.filename}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Monitor */}
        <div style={{ ...panel, padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
          <div style={{ position: 'relative', height: 320, borderRadius: 10, background: '#000', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
            {!shown && <div style={{ color: C.faint, fontSize: 13 }}>Coloque mídias na trilha para ver aqui</div>}
            {shown?.kind === 'video' && <video key={shown.mediaId} ref={videoRef} src={mediaPreviewUrl(shown.mediaId)} onTimeUpdate={onTime} onLoadedMetadata={(e) => { e.currentTarget.currentTime = shown.in; if (playing) e.currentTarget.play().catch(() => {}); }} playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
            {shown?.kind === 'image' && <img src={mediaFileUrl(shown.mediaId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={togglePlay} disabled={!clips.length} style={{ ...btn(playing), height: 34 }}>{playing ? '❚❚ Pausar' : '▶ Tocar timeline'}</button>
            <span style={{ fontSize: 12.5, color: C.muted }}>{clips.length} clipe(s) · total <b style={{ color: C.text }}>{fmt(total)}</b>{music ? ' · com música' : ''}</span>
          </div>
          {selClip && (
            <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <b style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selClip.filename}</b>
                <button onClick={() => move(selClip.key, -1)} title="Mover para a esquerda" style={btn(false)}>◀</button>
                <button onClick={() => move(selClip.key, 1)} title="Mover para a direita" style={btn(false)}>▶</button>
                <button onClick={() => add({ id: selClip.mediaId, kind: selClip.kind, filename: selClip.filename, durationSec: selClip.src })} title="Duplicar" style={btn(false)}>⧉</button>
                <button onClick={() => remove(selClip.key)} style={{ ...btn(false), color: C.red }}>Remover</button>
              </div>
              {selClip.kind === 'video' ? (
                [['in', 'Começa em'], ['out', 'Termina em']].map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                    <span style={{ width: 74 }}>{label}</span>
                    <input type="range" min="0" max={Math.max(0.5, selClip.src || selClip.out)} step="0.1" value={selClip[k]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        update(selClip.key, k === 'in' ? { in: Math.min(v, selClip.out - 0.3) } : { out: Math.max(v, selClip.in + 0.3) });
                      }} style={{ flex: 1 }} />
                    <span style={{ width: 46, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(selClip[k])}</span>
                  </label>
                ))
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                  <span style={{ width: 74 }}>Duração</span>
                  <input type="range" min="0.5" max="15" step="0.5" value={selClip.duration} onChange={(e) => update(selClip.key, { duration: Number(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ width: 46, textAlign: 'right' }}>{selClip.duration.toFixed(1)}s</span>
                </label>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timeline: V1 (vídeo principal) e A2 (música) */}
      <div style={{ ...panel, padding: 12, outline: dragOver ? `2px dashed ${C.orange}` : 'none' }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDropTimeline}>
        <div style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted }}><span style={{ background: '#2D8CFF', color: '#fff', borderRadius: 4, padding: '1px 6px', marginRight: 6 }}>V1</span>Vídeo</div>
          <div style={{ overflowX: 'auto', minHeight: 64, display: 'flex', gap: 3, padding: '4px 0' }}>
            {!clips.length && <div style={{ fontSize: 12.5, color: C.faint, alignSelf: 'center' }}>Arraste ou clique nas mídias para montar a sequência — elas entram aqui como o vídeo principal, uma depois da outra.</div>}
            {clips.map((c, i) => (
              <div key={c.key} draggable onDragStart={() => { dragKey.current = c.key; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.stopPropagation(); e.preventDefault(); setDragOver(false); const from = dragKey.current; dragKey.current = null; if (!from || from === c.key) { onDropTimeline(e); return; } setClips((l) => { const a = l.findIndex((x) => x.key === from); const n = l.slice(); const [it] = n.splice(a, 1); n.splice(l.findIndex((x) => x.key === c.key), 0, it); return n; }); }}
                onClick={() => { setSel(c.key); setPlaying(false); }}
                title={`${i + 1}. ${c.filename} · ${fmt(clipLen(c))} — arraste para mudar a ordem`}
                style={{ flex: 'none', width: Math.max(56, clipLen(c) * pps), height: 56, borderRadius: 7, overflow: 'hidden', position: 'relative', cursor: 'grab', border: sel === c.key ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)', background: c.kind === 'video' ? '#3B5BDB' : '#0E7490' }}>
                {c.kind === 'image' ? <img src={mediaFileUrl(c.mediaId)} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
                  : <video src={`${mediaPreviewUrl(c.mediaId)}#t=${c.in + 0.2}`} preload="metadata" muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />}
                <span style={{ position: 'absolute', left: 5, top: 4, right: 5, fontSize: 10.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 2px #000' }}>{i + 1}. {c.filename}</span>
                <span style={{ position: 'absolute', left: 5, bottom: 4, fontSize: 10, color: '#fff', textShadow: '0 1px 2px #000' }}>{fmt(clipLen(c))}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted }}><span style={{ background: '#16A34A', color: '#fff', borderRadius: 4, padding: '1px 6px', marginRight: 6 }}>A2</span>Música</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
            {music ? (
              <>
                <div style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 7, background: 'rgba(22,163,74,0.35)', border: '1px solid #16A34A', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>♪ {music.filename}</div>
                <span style={{ fontSize: 11.5, color: C.muted }}>Volume</span>
                <input type="range" min="0" max="1" step="0.05" value={music.volume} onChange={(e) => setMusic((m) => ({ ...m, volume: Number(e.target.value) }))} style={{ width: 110 }} />
                <span style={{ fontSize: 11.5, width: 34 }}>{Math.round(music.volume * 100)}%</span>
                <button onClick={() => setMusic(null)} style={{ ...btn(false), color: C.red }}>×</button>
              </>
            ) : <span style={{ fontSize: 12, color: C.faint }}>Opcional: clique numa música do painel (ou importe uma) para tocar por baixo do vídeo todo.</span>}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
        Na edição você continua tendo tudo: legenda automática da fala, cortes, textos, camadas por cima (aba Minhas mídias), B-roll, cor e efeitos.
      </div>
      <style>{`@media (max-width: 860px){ .rf-seq-top{ grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
    </div>
  );
}
