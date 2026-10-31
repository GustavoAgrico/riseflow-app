import React, { useState } from 'react';
import { C } from '../theme.js';
import Icon from './Icon.jsx';
import { parseYoutubeUrl, youtubeThumb } from '../../../shared/youtubeUrl.js';

const YT_RED = '#FF3B3B';

/** "Vídeo" escolhido a partir de um link do YouTube (o servidor baixa na 1ª etapa do job). */
export function youtubeSource(raw) {
  const yt = parseYoutubeUrl(raw);
  return yt ? { youtubeUrl: yt.url, id: yt.id, name: 'Vídeo do YouTube', size: 0 } : null;
}

/**
 * Campo "cole o link do YouTube": em vez de enviar o arquivo, a pessoa cola o link de um
 * vídeo (ou Shorts/live gravada) e a IA faz os cortes / o vídeo curto a partir dele.
 * `available` = o servidor tem o yt-dlp (capabilities.youtubeImport).
 */
export default function YoutubeLink({ onFile, available = true }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');

  function submit(raw = value) {
    const src = youtubeSource(raw);
    if (!src) {
      setErr(String(raw || '').trim() ? 'Esse link não parece de um vídeo do YouTube (youtube.com/watch?v=…, youtu.be/… ou /shorts/…).' : '');
      return;
    }
    setErr('');
    onFile(src);
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 10px', color: C.faint, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8 }}>
        <span style={{ flex: 1, height: 1, background: C.border }} />
        OU COLE O LINK DO YOUTUBE
        <span style={{ flex: 1, height: 1, background: C.border }} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: available ? 1 : 0.55 }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 14px', borderRadius: 13, border: `1px solid ${err ? `${C.red}88` : C.border}`, background: 'rgba(255,255,255,0.035)' }}>
          <Icon name="youtube" size={19} strokeWidth={1.9} color={YT_RED} />
          <input
            type="url"
            inputMode="url"
            value={value}
            disabled={!available}
            onChange={(e) => { setValue(e.target.value); if (err) setErr(''); }}
            // colou um link válido: já usa (sem precisar clicar em "Usar link")
            onPaste={(e) => { const t = e.clipboardData?.getData('text'); if (t && youtubeSource(t)) { e.preventDefault(); setValue(t.trim()); submit(t); } }}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="Link do vídeo do YouTube"
            style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', background: 'transparent', color: C.text, fontSize: 14.5, fontFamily: 'inherit' }}
          />
        </div>
        <button
          type="submit"
          disabled={!available || !value.trim()}
          style={{ height: 48, padding: '0 18px', borderRadius: 13, border: `1px solid ${C.border}`, background: available && value.trim() ? 'rgba(255,59,59,0.14)' : 'transparent', color: available && value.trim() ? C.text : C.faint, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: available && value.trim() ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
        >
          <Icon name="check" size={15} strokeWidth={2.4} /> Usar link
        </button>
      </form>
      <div style={{ fontSize: 12.5, color: err ? C.red : C.faint, marginTop: 7, lineHeight: 1.5 }}>
        {!available
          ? 'Importar pelo link do YouTube não está disponível neste servidor (falta o yt-dlp). Baixe o vídeo e envie o arquivo.'
          : err || 'Vídeos públicos ou não listados, Shorts e lives já encerradas. O vídeo é baixado direto no servidor — não gasta a sua internet.'}
      </div>
    </div>
  );
}

/** Cartão do link escolhido (no lugar do cartão do arquivo). */
export function YoutubeCard({ source, onClear, disabled }) {
  const [thumbOk, setThumbOk] = useState(true);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 15, border: `1px solid ${C.border}`, borderRadius: 18, padding: 14, background: 'linear-gradient(180deg, rgba(255,59,59,0.07), rgba(255,255,255,0.015))', overflow: 'hidden' }}>
      <div style={{ width: 112, aspectRatio: '16 / 9', borderRadius: 11, overflow: 'hidden', background: '#000', display: 'grid', placeItems: 'center', flexShrink: 0, position: 'relative' }}>
        {thumbOk
          ? <img src={youtubeThumb(source.id)} alt="" onError={() => setThumbOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <Icon name="youtube" size={28} strokeWidth={1.7} color={YT_RED} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="youtube" size={16} strokeWidth={2} color={YT_RED} /> Vídeo do YouTube
        </div>
        <div style={{ color: C.muted, fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{source.youtubeUrl}</div>
        <div style={{ color: C.green, fontSize: 12.5, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="check" size={13} strokeWidth={2.6} /> pronto — o servidor baixa quando você criar
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 13, fontWeight: 600, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 20, padding: '8px 14px', background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
      >
        <Icon name="close" size={14} strokeWidth={2} /> Trocar
      </button>
    </div>
  );
}
