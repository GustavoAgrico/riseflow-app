import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class LocalDB {
  constructor(dataDir) {
    const dbPath = path.join(dataDir, 'riseframe.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  initialize() {
    // Tabela de configurações
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de jobs (histórico de processamento)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        filename TEXT,
        status TEXT,
        progress INTEGER DEFAULT 0,
        startedAt DATETIME,
        completedAt DATETIME,
        error TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        id INTEGER PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        expiresAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Configurações
  getSetting(key) {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key);
    return result ? JSON.parse(result.value) : null;
  }

  setSetting(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = CURRENT_TIMESTAMP
    `);
    stmt.run(key, JSON.stringify(value), JSON.stringify(value));
  }

  // Jobs
  createJob(id, filename) {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (id, filename, status, startedAt)
      VALUES (?, ?, 'running', CURRENT_TIMESTAMP)
    `);
    stmt.run(id, filename);
  }

  updateJob(id, status, progress, error = null) {
    const stmt = this.db.prepare(`
      UPDATE jobs SET status = ?, progress = ?, error = ?
      WHERE id = ?
    `);
    stmt.run(status, progress, error, id);
  }

  completeJob(id) {
    const stmt = this.db.prepare(`
      UPDATE jobs SET status = 'completed', completedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
  }

  getJob(id) {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?');
    return stmt.get(id);
  }

  getJobs(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs ORDER BY createdAt DESC LIMIT ?
    `);
    return stmt.all(limit);
  }

  close() {
    this.db.close();
  }
}

export default LocalDB;
