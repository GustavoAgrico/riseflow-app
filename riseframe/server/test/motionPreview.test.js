import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { drawExplainer, previewScene, MOTION_STYLES } from '../../shared/motionEngine.js';

// As miniaturas do seletor de estilo do motion (Criar vídeo) desenham previewScene(style).
// Regressão: as palavras vinham como {text, at} e os desenhos liam w.w → "undefined".
test('miniaturas do motion: nenhum estilo escreve "undefined" ou "NaN"', () => {
  const styles = Object.keys(MOTION_STYLES).filter((s) => previewScene(s));
  assert.ok(styles.length >= 5, `poucos estilos com miniatura: ${styles}`);
  for (const style of styles) {
    const c = createCanvas(108, 192);
    const ctx = c.getContext('2d');
    const texts = [];
    for (const fn of ['fillText', 'strokeText', 'measureText']) {
      const orig = ctx[fn].bind(ctx);
      ctx[fn] = (txt, ...rest) => { texts.push(String(txt)); return orig(txt, ...rest); };
    }
    drawExplainer(ctx, previewScene(style), 1.0, { W: 108, H: 192, image: () => null });
    const bad = texts.filter((t) => /undefined/i.test(t) || /\bNaN\b/.test(t));
    assert.deepEqual(bad, [], `estilo ${style} escreveu: ${bad.join(' | ')}`);
    assert.ok(texts.some((t) => /design|motion/i.test(t)), `estilo ${style} não escreveu o texto de exemplo: ${texts.slice(0, 6).join(' | ')}`);
  }
});
