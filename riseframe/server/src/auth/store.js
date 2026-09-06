import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Armazenamento simples de usuários em arquivo JSON (data/users.json). Sem banco de
 * dados / dependências nativas — ideal para rodar local no Windows. Senhas são
 * guardadas com scrypt (sal único por usuário), nunca em texto puro.
 */
const FILE = path.join(config.paths.data, 'users.json');

let users = null; // cache em memória

function load() {
  if (users) return users;
  try {
    users = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(users)) users = [];
  } catch {
    users = [];
  }
  return users;
}

function persist() {
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

const norm = (email) => String(email || '').trim().toLowerCase();

export function findByEmail(email) {
  return load().find((u) => u.email === norm(email)) || null;
}

/** Cria um usuário. Lança se o email já existe. Retorna o usuário público. */
export function createUser({ email, password, name }) {
  load();
  const e = norm(email);
  if (users.some((u) => u.email === e)) {
    const err = new Error('email já cadastrado');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }
  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email: e,
    name: String(name || '').trim() || e.split('@')[0],
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  persist();
  return publicUser(user);
}

/**
 * Encontra o usuário pelo email (login Google) ou cria um novo sem senha.
 * O campo `google` guarda o `sub` do Google para futuras verificações.
 */
export function findOrCreateGoogleUser({ email, name, sub }) {
  load();
  const e = norm(email);
  let user = users.find((u) => u.email === e);
  if (user) {
    if (sub && !user.google) {
      user.google = sub;
      persist();
    }
    return publicUser(user);
  }
  user = {
    id: crypto.randomUUID(),
    email: e,
    name: String(name || '').trim() || e.split('@')[0],
    google: sub || null,
    // Sem senha local: só pode entrar via Google até definir uma senha.
    salt: null,
    hash: null,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  persist();
  return publicUser(user);
}

/** Define/redefine a senha de um usuário existente (recuperação). */
export function setPassword(email, password) {
  load();
  const user = users.find((u) => u.email === norm(email));
  if (!user) return null;
  const { salt, hash } = hashPassword(password);
  user.salt = salt;
  user.hash = hash;
  persist();
  return publicUser(user);
}

/** Confere a senha; retorna o usuário público ou null. Tempo constante. */
export function verifyCredentials(email, password) {
  const user = findByEmail(email);
  if (!user || !user.salt || !user.hash) return null; // conta só-Google não tem senha
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(user.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return publicUser(user);
}

/** Só os campos seguros para enviar ao cliente. */
export function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}
