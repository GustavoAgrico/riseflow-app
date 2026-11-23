import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeCaps, claudeParams, effortFor, CLAUDE_EFFORT } from '../src/pipeline/llm.js';
import { config, analyzeModel } from '../src/config.js';
import { reviewSpec } from '../src/routes/motion.js';
import { fallbackPromptSpec, promptMotionUser, promptMotionReviewSystem, reviewTimes } from '../../shared/promptMotion.js';

test('Claude: Opus 5.5 é o modelo padrão da IA de edição e motion', () => {
  if (!process.env.ANALYZE_MODEL) assert.equal(config.analyze.model, 'claude-opus-5-5');
  assert.equal(analyzeModel(''), 'claude-opus-5-5');
  // o Haiku 4.5 que vinha no .env.example antigo era só exemplo: vira o Opus 5.5
  assert.equal(analyzeModel('claude-haiku-4-5-20251001'), 'claude-opus-5-5');
  // escolha de propósito continua valendo
  assert.equal(analyzeModel('claude-sonnet-5-5'), 'claude-sonnet-5-5');
});

test('Claude: Opus 5.5 com pensamento adaptativo, esforço da tarefa, cache e plano B', () => {
  const p = claudeParams({ model: 'claude-opus-5-5', system: 'sys', content: 'u', task: 'motion' });
  assert.deepEqual(p.thinking, { type: 'adaptive' });
  assert.equal(p.output_config.effort, 'high');
  assert.equal(p.system[0].cache_control.type, 'ephemeral');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
  assert.equal(p.max_tokens, 16000);
  // nada de parâmetros que o Opus 5.5 recusa
  for (const k of ['temperature', 'top_p', 'top_k', 'budget_tokens']) assert.ok(!(k in p), k);
  assert.ok(!JSON.stringify(p).includes('disabled'));
  // tarefas leves com menos esforço
  assert.equal(claudeParams({ model: 'claude-opus-5-5', system: 's', content: 'u', task: 'translate' }).output_config.effort, 'medium');
});

test('Claude: modelos antigos (via ANALYZE_MODEL) não recebem o que não aceitam', () => {
  const old = claudeParams({ model: 'claude-haiku-4-5-20251001', system: 's', content: 'u' });
  assert.ok(!old.thinking && !old.output_config && !old.betas && !old.fallbacks);
  assert.deepEqual(claudeCaps('claude-sonnet-5-5'), { adaptive: true, effort: true, fallbacks: true });
  assert.deepEqual(claudeCaps('claude-sonnet-5'), { adaptive: true, effort: true, fallbacks: false });
  assert.deepEqual(claudeCaps('claude-opus-5'), { adaptive: true, effort: true, fallbacks: true });
  assert.deepEqual(claudeCaps('claude-opus-4-8'), { adaptive: true, effort: true, fallbacks: false });
});

test('Claude: esforço por tarefa ajustável por variável de ambiente', () => {
  assert.equal(effortFor('motion', {}), CLAUDE_EFFORT.motion);
  assert.equal(effortFor('motion', { RISEFRAME_CLAUDE_EFFORT: 'xhigh' }), 'xhigh');
  assert.equal(effortFor('motion', { RISEFRAME_CLAUDE_EFFORT: 'xhigh', RISEFRAME_CLAUDE_EFFORT_MOTION: 'max' }), 'max');
  assert.equal(effortFor('motion', { RISEFRAME_CLAUDE_EFFORT_MOTION: 'turbo' }), CLAUDE_EFFORT.motion, 'valor inválido é ignorado');
  // a variável do Claude Code (sem prefixo) não mexe no Riseframe
  assert.equal(effortFor('translate', { CLAUDE_EFFORT: 'max' }), CLAUDE_EFFORT.translate);
});

test('motion: revisão visual manda os quadros renderizados ao Claude e aplica a correção', async () => {
  const spec = fallbackPromptSpec('Siga para mais dicas', { goal: 'cta', duration: 3 });
  let seen = null;
  const fake = async (system, content, cfg, opts) => {
    seen = { system, content, opts };
    const fixed = JSON.parse(JSON.stringify(spec));
    fixed.elements[0].y = 0.35; // "subi o texto"
    return JSON.stringify({ ...fixed, review: 'subi o texto principal para a área segura' });
  };
  const r = await reviewSpec(spec, { aspect: '9:16' }, { anthropicKey: 'x' }, fake);
  const imgs = seen.content.filter((c) => c.type === 'image');
  assert.equal(imgs.length, reviewTimes(spec).length);
  assert.equal(imgs[0].source.media_type, 'image/png');
  assert.ok(Buffer.from(imgs[0].source.data, 'base64').subarray(1, 4).toString() === 'PNG');
  assert.equal(seen.opts.task, 'review');
  assert.match(seen.system, /REVISÃO VISUAL/);
  assert.equal(r.spec.elements[0].y, 0.35);
  assert.equal(r.note, 'subi o texto principal para a área segura');
  assert.equal(r.spec.duration, spec.duration, 'duração não muda na revisão');
  // resposta inútil: fica a cena original
  const keep = await reviewSpec(spec, { aspect: '16:9' }, { anthropicKey: 'x' }, async () => '{"elements":[]}');
  assert.equal(keep.spec, spec);
});

test('motion: a fala do trecho vai para o Claude', () => {
  const u = promptMotionUser('contador', { goal: 'numeros' }, null, '', 'a gente saiu de 2 mil para 40 mil seguidores');
  assert.match(u, /Fala do vídeo neste ponto/);
  assert.match(u, /40 mil seguidores/);
  assert.doesNotMatch(promptMotionUser('x', {}), /Fala do vídeo/);
  assert.match(promptMotionReviewSystem(), /área segura/);
});
