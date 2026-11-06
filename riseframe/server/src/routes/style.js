import { Router } from 'express';
import { requireAuth } from './auth.js';
import { resolveMedia, removeFromLibrary } from '../mediaStore.js';
import { analyzeReference } from '../pipeline/refAnalyze.js';
import { makeLogger } from '../logger.js';

// Meu fluxo → Referências: mede um trecho de vídeo de que a pessoa gosta (ritmo de corte,
// movimento na tela e câmera) para montar o perfil de estilo dela.
export const styleRouter = Router();
const log = makeLogger('style');

// Uma análise por vez no servidor (é CPU pura; várias juntas atrasariam os renders).
let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

// POST /api/style/reference  { mediaId } → medidas da referência
// O vídeo é enviado antes por POST /api/media; depois da análise ele sai da biblioteca
// (referência não é mídia do projeto).
styleRouter.post('/style/reference', requireAuth, async (req, res) => {
  const id = typeof req.body?.mediaId === 'string' ? req.body.mediaId : '';
  const media = resolveMedia(id);
  if (!media) return res.status(404).json({ error: 'referência não encontrada — envie o vídeo de novo' });
  if (media.ownerId && String(media.ownerId) !== String(req.user?.id)) return res.status(404).json({ error: 'referência não encontrada' });
  if (media.kind !== 'video') return res.status(400).json({ error: 'a referência precisa ser um vídeo' });
  try {
    const metrics = await serial(() => analyzeReference(media.path));
    res.json({ metrics });
  } catch (err) {
    log.warn(`análise da referência falhou: ${err.message}`);
    res.status(422).json({ error: 'não deu para analisar este vídeo — tente outro trecho' });
  } finally {
    if (media.ownerId) removeFromLibrary(id, media.ownerId);
  }
});
