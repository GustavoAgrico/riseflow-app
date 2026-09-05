import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNiche, resolveNiche, NICHES } from '../src/pipeline/niche.js';

test('detectNiche: identifica o nicho pela fala', () => {
  assert.equal(detectNiche('liderança líder equipe gestão resultado da empresa'), 'leadership');
  assert.equal(detectNiche('médico paciente clínica tratamento hospital'), 'medical');
  assert.equal(detectNiche('mentor mentoria coaching aluno jornada'), 'mentor');
  assert.equal(detectNiche('café manhã parque cachorro'), null); // sem sinal → null
});

test('resolveNiche: escolha do usuário tem prioridade sobre a detecção', () => {
  const r = resolveNiche('medical', 'liderança líder equipe');
  assert.equal(r.id, 'medical');
  assert.ok(r.core && r.fallback);
  // auto → cai na detecção
  assert.equal(resolveNiche('auto', 'médico paciente hospital tratamento').id, 'medical');
  // auto sem sinal → null
  assert.equal(resolveNiche('auto', 'café parque'), null);
});

test('NICHES: todos têm core, fallback e palavras-chave', () => {
  for (const [id, n] of Object.entries(NICHES)) {
    assert.ok(n.core, `${id} core`);
    assert.ok(n.fallback, `${id} fallback`);
    assert.ok(Array.isArray(n.kw) && n.kw.length, `${id} kw`);
  }
});
