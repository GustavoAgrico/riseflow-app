import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLanguage } from '../src/pipeline/transcribe/index.js';

test('cleanLanguage: só códigos de idioma; o resto vira "detectar sozinho"', () => {
  assert.equal(cleanLanguage('pt'), 'pt');
  assert.equal(cleanLanguage('pt-BR'), 'pt-BR');
  assert.equal(cleanLanguage(''), '');
  assert.equal(cleanLanguage(undefined), '');
  assert.equal(cleanLanguage('portugues'), '');
  assert.equal(cleanLanguage('pt&x=1'), '');
});
