// Meu fluxo de edição: os perfis de estilo da pessoa (gosto separado do ofício), guardados
// neste navegador como o Brand Kit. Um perfil fica ATIVO e entra nas opções de todo vídeo
// novo (corte, hesitações, notas faladas, animação, câmera, som). Sem perfil, nada muda.
import { profileToOptions } from '../../shared/editFlow.js';

const KEY = 'riseframe_flows';
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && Array.isArray(v.profiles)) return v;
  } catch {
    /* armazenamento corrompido: recomeça */
  }
  return { activeId: '', profiles: [] };
}

function write(st) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
    return true;
  } catch {
    return false;
  }
}

const normalize = (p) => ({
  name: 'Meu estilo',
  answers: {},
  references: [],
  rules: [],
  learnings: [],
  montagem: { phase: 'entrevista' },
  ...p,
});

export function listProfiles() {
  return read().profiles.map(normalize);
}

export function activeProfileId() {
  const st = read();
  return st.profiles.some((p) => p.id === st.activeId) ? st.activeId : '';
}

/** O perfil ativo (ou o do id pedido); null se não houver. */
export function loadProfile(id) {
  const st = read();
  const want = id || st.activeId;
  const p = st.profiles.find((x) => x.id === want);
  return p ? normalize(p) : null;
}

export function saveProfile(p) {
  const st = read();
  // respostas cruas: o que não foi respondido segue a sugestão do momento (completeAnswers na leitura)
  const prof = { ...normalize(p), id: p.id || newId('f'), answers: { ...(p.answers || {}) }, updatedAt: new Date().toISOString() };
  const i = st.profiles.findIndex((x) => x.id === prof.id);
  if (i < 0) st.profiles.push(prof);
  else st.profiles[i] = prof;
  return write(st) ? prof : null;
}

/** Novo perfil (em branco ou cópia de outro: "um estilo novo é um perfil novo"). Fica ativo. */
export function createProfile(from = null) {
  const st = read();
  const base = from
    ? { ...from, id: undefined, name: `${from.name || 'Estilo'} (cópia)`.slice(0, 60), learnings: [] }
    : { name: st.profiles.length ? `Estilo ${st.profiles.length + 1}` : 'Meu estilo' };
  const prof = { ...normalize(base), id: newId('f'), createdAt: new Date().toISOString() };
  st.profiles.push(prof);
  st.activeId = prof.id;
  return write(st) ? prof : null;
}

export function deleteProfile(id) {
  const st = read();
  st.profiles = st.profiles.filter((p) => p.id !== id);
  if (st.activeId === id) st.activeId = ''; // nenhum estilo nos vídeos novos até a pessoa escolher
  return write(st);
}

/** '' = nenhum perfil nos vídeos novos. */
export function setActiveProfile(id) {
  const st = read();
  st.activeId = id && st.profiles.some((p) => p.id === id) ? id : '';
  return write(st);
}

/** As opções do perfil ativo, para somar às de um vídeo novo (antes do Brand Kit/template). */
export function flowOptions(p = loadProfile()) {
  if (!p || p.montagem?.phase !== 'pronto') return {}; // perfil ainda sendo montado
  return profileToOptions(p);
}

/** Estilos prontos (montagem concluída), para escolher ao criar um vídeo. */
export function readyProfiles() {
  return listProfiles().filter((p) => p.montagem?.phase === 'pronto');
}

/** As chaves de opção que um estilo decide (para tirar as do estilo anterior ao trocar). */
export const FLOW_OPTION_KEYS = Object.keys(profileToOptions({ answers: {} }));

/** Anota um aprendizado no caderno do perfil (nunca apaga linhas). */
export function addLearning(profileId, { stage, text, preset }) {
  const p = loadProfile(profileId);
  if (!p || !String(text || '').trim()) return null;
  const line = { id: newId('l'), stage: stage || 'geral', text: String(text).trim().slice(0, 240), preset: preset || null, date: new Date().toISOString(), status: 'aberto' };
  return saveProfile({ ...p, learnings: [...(p.learnings || []), line] });
}
