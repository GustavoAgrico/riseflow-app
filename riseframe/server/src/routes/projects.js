import express, { Router } from 'express';
import { requireAuth } from './auth.js';
import { saveProject, loadProject, listProjects, deleteProject, validProjectId } from '../projects.js';

/**
 * Projetos do editor (salvos automaticamente a cada 30 s pelo editor):
 *   GET    /api/projects        → lista (cartões de "Meus projetos")
 *   GET    /api/projects/:id    → projeto completo (para reabrir com tudo)
 *   PUT    /api/projects/:id    → salva { state, meta }
 *   DELETE /api/projects/:id
 */
export const projectsRouter = Router();
// projeto com transcrição longa passa de 1 MB (limite geral do JSON)
const bigJson = express.json({ limit: '5mb' });

projectsRouter.get('/projects', requireAuth, async (req, res) => {
  res.json({ projects: await listProjects(req.user.id) });
});

projectsRouter.get('/projects/:id', requireAuth, async (req, res) => {
  const doc = await loadProject(req.user.id, req.params.id);
  if (!doc) return res.status(404).json({ error: 'projeto não encontrado' });
  res.json(doc);
});

projectsRouter.put('/projects/:id', requireAuth, bigJson, async (req, res) => {
  if (!validProjectId(req.params.id)) return res.status(400).json({ error: 'id de projeto inválido' });
  try {
    res.json(await saveProject(req.user.id, req.params.id, { state: req.body?.state, meta: req.body?.meta }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

projectsRouter.delete('/projects/:id', requireAuth, async (req, res) => {
  await deleteProject(req.user.id, req.params.id);
  res.json({ ok: true });
});
