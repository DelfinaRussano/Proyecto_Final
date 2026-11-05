import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import { initDatabase, scoresRepo, usersRepo } from './db.ts'

const app = express()
const PORT = process.env.PORT || 3001

// Middlewares
app.use(cors())
app.use(express.json())

// Inicializar la base de datos al arrancar
initDatabase()

// Healthcheck
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', database: 'connected' })
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
    const { playerName, streak, durationSeconds, difficulty } = req.body

    if (
      typeof streak !== 'number' ||
      typeof durationSeconds !== 'number' ||
      !['easy', 'normal', 'hard'].includes(difficulty)
    ) {
      return res.status(400).json({ error: 'Datos de partida inválidos' })
    }

    // Identificar o crear usuario
    const targetPlayerName = (typeof playerName === 'string' && playerName.trim())
      ? playerName.trim()
      : 'Jugador local'

    let user = usersRepo.getByUsername(targetPlayerName)
    if (!user) {
      user = usersRepo.create(targetPlayerName, 'guest_account')
    }

    // Insertar el resultado en la tabla relacional normalizada
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
    const id = Number(req.params.id)
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID de registro inválido' })
    }

    const deleted = scoresRepo.delete(id)
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
