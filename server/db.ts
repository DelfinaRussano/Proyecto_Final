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

    CREATE INDEX IF NOT EXISTS idx_scores_difficulty ON scores(difficulty);
    CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
  `)

  // Asegurar usuario por defecto para partidas como invitado / jugador local
  const guestUser = db.prepare('SELECT id FROM users WHERE username = ?').get('Jugador local') as { id: number } | undefined
  if (!guestUser) {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('Jugador local', 'guest_account')
  }
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
      WHERE s.difficulty = ?
      ORDER BY s.streak DESC, s.duration_seconds ASC
      LIMIT ?
    `)
    return query.all(difficulty, limit) as unknown as DbScoreEntry[]
  },

  // Baja (Delete)
  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM scores WHERE id = ?')
    const result = stmt.run(id)
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
    const query = db.prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ?')
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

