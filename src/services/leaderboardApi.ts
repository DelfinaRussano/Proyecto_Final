export type Difficulty = 'easy' | 'normal' | 'hard'

export interface LeaderboardEntry {
  id: string | number
  playerName: string
  streak: number
  durationSeconds: number
  difficulty: Difficulty
  created_at?: string
}

const LOCAL_STORAGE_KEY = 'flagquest-leaderboard-v1'

function getLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveLocalLeaderboard(entries: LeaderboardEntry[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Ignore storage errors
  }
}

// 1. Consulta (Read): Carga el ranking desde la API conectada a SQLite
export async function getLeaderboardFromApi(difficulty: Difficulty): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`/api/leaderboard?difficulty=${difficulty}&limit=10`)
    if (!res.ok) {
      throw new Error(`Error ${res.status} al consultar API`)
    }
    const data: LeaderboardEntry[] = await res.json()
    return data
  } catch (err) {
    console.warn('API no disponible, usando respaldo local:', err)
    const local = getLocalLeaderboard()
    return local
      .filter((e) => e.difficulty === difficulty)
      .sort((a, b) => b.streak - a.streak || a.durationSeconds - b.durationSeconds)
      .slice(0, 10)
  }
}

// 2. Alta (Create): Guarda una partida en la base de datos SQLite
export async function saveScoreToApi(
  playerName: string,
  streak: number,
  durationSeconds: number,
  difficulty: Difficulty,
): Promise<LeaderboardEntry> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, streak, durationSeconds, difficulty }),
    })

    if (!res.ok) {
      throw new Error(`Error ${res.status} al guardar en API`)
    }

    const saved: LeaderboardEntry = await res.json()
    return saved
  } catch (err) {
    console.warn('Fallo al guardar en la API, guardando en respaldo local:', err)
    const entry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      playerName,
      streak,
      durationSeconds,
      difficulty,
    }
    const local = getLocalLeaderboard()
    saveLocalLeaderboard([...local, entry])
    return entry
  }
}

// 3. Baja (Delete): Elimina un registro de la base de datos (ABM)
export async function deleteScoreFromApi(id: string | number): Promise<boolean> {
  try {
    const res = await fetch(`/api/leaderboard/${id}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch (err) {
    console.warn('Error al eliminar en API:', err)
    const local = getLocalLeaderboard()
    saveLocalLeaderboard(local.filter((e) => e.id !== id))
    return true
  }
}

