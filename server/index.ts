import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { authRepo, initDatabase, scoresRepo, usersRepo, type DbSessionUser } from './db.ts'

const app = express()
const PORT = process.env.PORT || 3001

// Middlewares
app.use(cors())
app.use(express.json({ limit: '10kb' }))

// Inicializar la base de datos al arrancar
initDatabase()

const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000
const passwordSaltBytes = 16
const passwordHashBytes = 64

function hashPassword(password: string) {
  const salt = randomBytes(passwordSaltBytes)
  const hash = scryptSync(password, salt, passwordHashBytes)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltHex, hashHex] = storedHash.split('$')
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false

  const expectedHash = Buffer.from(hashHex, 'hex')
  const actualHash = scryptSync(password, Buffer.from(saltHex, 'hex'), passwordHashBytes)
  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash)
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function getAuthenticatedUser(req: Request): DbSessionUser | null {
  const authorization = req.header('authorization')
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1]
  return token ? authRepo.getSessionUser(hashSessionToken(token), Date.now()) : null
}

function createSession(userId: number) {
  const token = randomBytes(32).toString('base64url')
  authRepo.createSession(hashSessionToken(token), userId, Date.now() + sessionLifetimeMs)
  return token
}

// Healthcheck
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', database: 'connected' })
})

app.post('/api/auth/register', (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username)) {
    return res.status(400).json({ error: 'El usuario debe tener entre 3 y 20 letras, números, guiones o guiones bajos.' })
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 128 caracteres.' })
  }

  try {
    const user = usersRepo.create(username, hashPassword(password))
    const token = createSession(user.id)
    return res.status(201).json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' })
    }
    console.error('Error al crear la cuenta:', error)
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' })
  }
})

app.post('/api/auth/login', (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const user = username ? usersRepo.getByUsername(username) : null

  if (!user || password.length > 128 || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' })
  }

  try {
    const token = createSession(user.id)
    return res.json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    console.error('Error al iniciar sesión:', error)
    return res.status(500).json({ error: 'No se pudo iniciar sesión.' })
  }
})

app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req)
  if (!user) return res.status(401).json({ error: 'La sesión no es válida o expiró.' })
  return res.json({ user })
})

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authorization = req.header('authorization')
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1]
  if (token) authRepo.deleteSession(hashSessionToken(token))
  return res.status(204).end()
})

// ABM / CRUD - Leaderboard (Scores)

// 1. Consulta (Read): Obtener ranking filtrado por dificultad
app.get('/api/leaderboard', (req: Request, res: Response) => {
  try {
    const difficultyParam = req.query.difficulty as string
    const difficulty = (['easy', 'normal', 'hard'].includes(difficultyParam)
      ? difficultyParam
      : 'easy') as 'easy' | 'normal' | 'hard'

    const limit = req.query.limit ? Math.min(Number(req.query.limit), 50) : 10
    const entries = scoresRepo.getLeaderboard(difficulty, limit)

    res.json(entries)
  } catch (error) {
    console.error('Error al obtener leaderboard:', error)
    res.status(500).json({ error: 'Error al consultar el ranking' })
  }
})

// 2. Alta (Create): Registrar nuevo puntaje en la base de datos
app.post('/api/leaderboard', (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Iniciá sesión para guardar una partida.' })

    const { streak, durationSeconds, difficulty } = req.body

    if (
      !Number.isInteger(streak) || streak < 0 ||
      !Number.isInteger(durationSeconds) || durationSeconds < 0 ||
      !['easy', 'normal', 'hard'].includes(difficulty)
    ) {
      return res.status(400).json({ error: 'Datos de partida inválidos' })
    }

    const newScore = scoresRepo.create(user.id, streak, durationSeconds, difficulty)
    res.status(201).json(newScore)
  } catch (error) {
    console.error('Error al guardar partida:', error)
    res.status(500).json({ error: 'Error al persistir la partida en la base de datos' })
  }
})

// 3. Baja (Delete): Eliminar una entrada del ranking (operación ABM)
app.delete('/api/leaderboard/:id', (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Iniciá sesión para eliminar una partida.' })

    const id = Number(req.params.id)
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID de registro inválido' })
    }

    const deleted = scoresRepo.delete(id, user.id)
    if (!deleted) {
      return res.status(404).json({ error: 'Registro no encontrado' })
    }

    res.json({ message: 'Registro eliminado con éxito', id })
  } catch (error) {
    console.error('Error al eliminar registro:', error)
    res.status(500).json({ error: 'Error al eliminar el registro en la base de datos' })
  }
})

// Escuchar peticiones
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend FlagQuest corriendo en http://localhost:${PORT}`)
})
