import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, GRAD } from '../theme.js';

// Guia rápido do editor (para quem nunca editou): escurece a tela, destaca uma parte
// por vez e explica em uma frase. Aparece na primeira vez; o botão "Guia" abre de novo.

const KEY = 'rf_tour_done';

export function tourSeen() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(KEY, '1'); } catch { /* sem armazenamento: só não lembra */ }
}

/** Passos: `sel` é uma lista de seletores — vale o primeiro que estiver visível na tela. */
export const EDITOR_TOUR = [
  { sel: ['.rf-tl-preview'], title: 'Seu vídeo', text: 'Aqui você assiste ao vídeo com tudo o que já foi feito. A barra de espaço toca e pausa.' },
  { sel: ['.rf-tl-nav'], title: 'Abas de edição', text: 'Cada aba cuida de uma coisa: legenda, cortes, cor, áudio, textos… Clique numa aba e as opções aparecem ao lado.' },
  { sel: ['.rf-tl-adjust'], title: 'Opções da aba', text: 'As opções da aba escolhida ficam aqui. Mexa à vontade: tudo aparece na hora no vídeo.' },
  { sel: ['.rf-tl-track'], title: 'Linha do tempo', text: 'Clique para ir a um ponto do vídeo e arraste os blocos para mover. Legendas em vermelho riscado foram cortadas: na aba Legenda › Legendas, “Restaurar” traz de volta.' },
  { sel: ['[data-tour="addcap"]'], title: 'Adicionar legenda', text: 'Coloca uma legenda sua no ponto atual. Para copiar e colar: selecione a legenda, Ctrl+C, leve o vídeo até outro ponto e Ctrl+V.' },
  { sel: ['.rf-tl-tools'], title: 'Ferramentas', text: 'Navalha para cortar, apagar, duplicar, desfazer (Ctrl+Z)… Pare o mouse em cima de um ícone para ver o que ele faz.' },
  { sel: ['.rf-tl-navend [data-tour="export"]', '.rf-tl-head [data-tour="export"]', '[data-tour="export"]'], title: 'Exportar', text: 'Quando estiver bom, exporte. O projeto fica salvo: dá para voltar e editar de novo quando quiser.' },
];

function visibleEl(sels) {
  for (const s of sels) {
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return el;
    }
  }
  return null;
}

export default function EditorTour({ steps = EDITOR_TOUR, onClose }) {
  // só os passos que existem nesta tela (no celular, por exemplo, algumas partes mudam)
  // (medido depois que o editor aparece na tela)
  const [list, setList] = useState(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = list?.[i];
  useEffect(() => {
    const t = setTimeout(() => {
      const found = steps.filter((s) => visibleEl(s.sel));
      if (!found.length) close();
      else setList(found);
    }, 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function close() { markSeen(); onClose?.(); }

  useLayoutEffect(() => {
    if (!step) return undefined;
    const el = visibleEl(step.sel);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const measure = () => {
      const r = visibleEl(step.sel)?.getBoundingClientRect();
      setRect(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step]);

  useEffect(() => {
    if (!list) return undefined;
    // enquanto o guia está aberto, as teclas são dele (não tocam o vídeo nem cortam nada)
    const onKey = (e) => {
      if (e.key === 'Tab') return;
      e.stopPropagation();
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function next() {
    if (i >= list.length - 1) close();
    else setI(i + 1);
  }
  if (!step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 6;
  const hole = rect && { left: Math.max(4, rect.x - pad), top: Math.max(4, rect.y - pad), width: Math.min(vw - 8, rect.w + pad * 2), height: Math.min(vh - 8, rect.h + pad * 2) };
  // Cartão: abaixo do destaque se couber; senão acima; senão à direita/esquerda; senão no meio.
  const cw = Math.min(340, vw - 24);
  const ch = 190;
  let pos = { left: (vw - cw) / 2, top: (vh - ch) / 2 };
  if (hole) {
    const cx = Math.min(vw - cw - 12, Math.max(12, hole.left + hole.width / 2 - cw / 2));
    if (hole.top + hole.height + ch + 14 < vh) pos = { left: cx, top: hole.top + hole.height + 12 };
    else if (hole.top - ch - 14 > 0) pos = { left: cx, top: hole.top - ch - 12 };
    else if (hole.left + hole.width + cw + 14 < vw) pos = { left: hole.left + hole.width + 12, top: Math.max(12, Math.min(vh - ch - 12, hole.top + 20)) };
    else if (hole.left - cw - 14 > 0) pos = { left: hole.left - cw - 12, top: Math.max(12, Math.min(vh - ch - 12, hole.top + 20)) };
  }

  // no <body>: dentro do editor um ancestral com transform deslocaria o `position: fixed`
  return createPortal(
    <div className="rf-tour" role="dialog" aria-modal="true" aria-label="Guia rápido do editor" style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
      {hole ? (
        <div style={{ position: 'fixed', ...hole, borderRadius: 14, boxShadow: '0 0 0 9999px rgba(5,5,10,0.72)', border: `2px solid ${C.orange}`, transition: 'all .25s ease', pointerEvents: 'none' }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,10,0.72)' }} />
      )}
      <div style={{ position: 'fixed', ...pos, width: cw, boxSizing: 'border-box', padding: 16, borderRadius: 16, background: '#16161F', border: `1px solid ${C.border}`, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.9)', color: C.text, fontFamily: 'inherit', transition: 'top .25s ease, left .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.orangeSoft, letterSpacing: 0.4, textTransform: 'uppercase' }}>Guia rápido · {i + 1} de {list.length}</span>
          <button onClick={close} aria-label="Fechar o guia" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.faint, fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 2 }}>×</button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.muted }}>{step.text}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {list.map((_, k) => <span key={k} style={{ width: k === i ? 16 : 6, height: 6, borderRadius: 3, background: k === i ? C.orange : 'rgba(255,255,255,0.18)', transition: 'width .2s' }} />)}
          </div>
          <button onClick={close} style={{ marginLeft: 'auto', height: 32, padding: '0 10px', borderRadius: 9, border: 'none', background: 'transparent', color: C.faint, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Pular</button>
          {i > 0 && <button onClick={() => setI(i - 1)} style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Voltar</button>}
          <button autoFocus onClick={next} style={{ height: 32, padding: '0 14px', borderRadius: 9, border: 'none', background: GRAD, color: '#fff', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {i >= list.length - 1 ? 'Começar a editar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
