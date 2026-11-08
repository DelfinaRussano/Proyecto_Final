import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'

const dataDir = path.resolve(process.cwd(), 'server/data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'flagquest.db')
export const db = new DatabaseSync(dbPath)

// Activar soporte de foreign keys en SQLite
db.exec('PRAGMA foreign_keys = ON;')

// Inicializar tablas normalizadas
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      streak INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      difficulty TEXT CHECK(difficulty IN ('easy', 'normal', 'hard')) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_scores_difficulty ON scores(difficulty);
    CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiration ON sessions(expires_at);
  `)
}

// Interfaces
export interface DbUser {
  id: number
  username: string
  password_hash: string
  created_at: string
}

export interface DbScoreEntry {
  id: number
  user_id: number
  playerName: string
  streak: number
  durationSeconds: number
  difficulty: 'easy' | 'normal' | 'hard'
  created_at: string
}

export interface DbSessionUser {
  id: number
  username: string
}

export const authRepo = {
  createSession(tokenHash: string, userId: number, expiresAt: number) {
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, userId, expiresAt)
  },

  getSessionUser(tokenHash: string, now: number): DbSessionUser | null {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
    const row = db.prepare(`
      SELECT u.id, u.username
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash, now)
    return (row as DbSessionUser) || null
  },

  deleteSession(tokenHash: string) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
  },
}

// Operaciones ABM / CRUD para Scores
export const scoresRepo = {
  // Alta (Create)
  create(userId: number, streak: number, durationSeconds: number, difficulty: 'easy' | 'normal' | 'hard'): DbScoreEntry {
    const insert = db.prepare(`
      INSERT INTO scores (user_id, streak, duration_seconds, difficulty)
      VALUES (?, ?, ?, ?)
    `)
    const result = insert.run(userId, streak, durationSeconds, difficulty)
    const newId = Number(result.lastInsertRowid)

    return this.getById(newId)!
  },

  // Consulta individual (Read by ID)
  getById(id: number): DbScoreEntry | null {
    const query = db.prepare(`
      SELECT 
        s.id,
        s.user_id,
        u.username AS playerName,
        s.streak,
        s.duration_seconds AS durationSeconds,
        s.difficulty,
        s.created_at
      FROM scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `)
    const row = query.get(id)
    return (row as DbScoreEntry) || null
  },

  // Consulta de ranking (Read / Leaderboard con JOIN normalizado)
  getLeaderboard(difficulty: 'easy' | 'normal' | 'hard', limit = 10): DbScoreEntry[] {
    const query = db.prepare(`
      SELECT 
        s.id,
        s.user_id,
        u.username AS playerName,
        s.streak,
        s.duration_seconds AS durationSeconds,
        s.difficulty,
        s.created_at
      FROM scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.difficulty = ? AND u.password_hash != 'guest_account'
      ORDER BY s.streak DESC, s.duration_seconds ASC
      LIMIT ?
    `)
    return query.all(difficulty, limit) as unknown as DbScoreEntry[]
  },

  // Baja (Delete)
  delete(id: number, userId: number): boolean {
    const stmt = db.prepare('DELETE FROM scores WHERE id = ? AND user_id = ?')
    const result = stmt.run(id, userId)
    return Number(result.changes) > 0
  },
}

// Operaciones ABM / CRUD para Users
export const usersRepo = {
  // Alta (Create)
  create(username: string, passwordHash: string): DbUser {
    const insert = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    const result = insert.run(username, passwordHash)
    return this.getById(Number(result.lastInsertRowid))!
  },

  // Consulta por ID (Read)
  getById(id: number): DbUser | null {
    const query = db.prepare('SELECT id, username, password_hash, created_at FROM users WHERE id = ?')
    return (query.get(id) as DbUser) || null
  },

  // Consulta por nombre de usuario (Read)
  getByUsername(username: string): DbUser | null {
    const query = db.prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ? COLLATE NOCASE')
    return (query.get(username) as DbUser) || null
  },

  // Modificación (Update)
  updateUsername(id: number, newUsername: string): boolean {
    const stmt = db.prepare('UPDATE users SET username = ? WHERE id = ?')
    const result = stmt.run(newUsername, id)
    return Number(result.changes) > 0
  },

  // Baja (Delete)
  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?')
    const result = stmt.run(id)
    return Number(result.changes) > 0
  },
}

// Ejecutar inicialización si se ejecuta directamente
if (process.argv[1]?.endsWith('db.ts')) {
  initDatabase()
  console.log('Base de datos SQLite inicializada exitosamente en:', dbPath)
  console.log('Leaderboard Fácil:', scoresRepo.getLeaderboard('easy'))
}
