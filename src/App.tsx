import { useState, useEffect } from 'react'
import './App.css'
import { GoogleCountryMap } from './components/GoogleCountryMap'
import {
  fetchAllCountries,
  getRandomChallenges,
  type CountryChallenge,
} from './services/countriesApi'

type Difficulty = 'easy' | 'hard'
const totalCountries = 195

interface LeaderboardEntry {
  id: string
  playerName: string
  streak: number
  durationSeconds: number
  difficulty: Difficulty
}

const leaderboardStorageKey = 'flagquest-leaderboard-v1'

function readLeaderboard(): LeaderboardEntry[] {
  try {
    const storedEntries = localStorage.getItem(leaderboardStorageKey)
    if (!storedEntries) return []
    const parsedEntries: unknown = JSON.parse(storedEntries)
    if (!Array.isArray(parsedEntries)) return []
    return parsedEntries.filter((entry): entry is LeaderboardEntry =>
      typeof entry?.id === 'string'
      && typeof entry?.playerName === 'string'
      && typeof entry?.streak === 'number'
      && typeof entry?.durationSeconds === 'number'
      && (entry?.difficulty === 'easy' || entry?.difficulty === 'hard'),
    )
  } catch {
    return []
  }
}

const INITIAL_FALLBACK: CountryChallenge[] = [
  { id: 'jp', country: 'Japón', continent: 'Asia', capital: 'Tokio', flagUrl: 'https://flagcdn.com/w640/jp.png', code: 'JP', numericCode: '392', isSovereign: true, population: 125800000 },
  { id: 'br', country: 'Brasil', continent: 'América del Sur', capital: 'Brasilia', flagUrl: 'https://flagcdn.com/w640/br.png', code: 'BR', numericCode: '076', isSovereign: true, population: 214300000 },
  { id: 'eg', country: 'Egipto', continent: 'África', capital: 'El Cairo', flagUrl: 'https://flagcdn.com/w640/eg.png', code: 'EG', numericCode: '818', isSovereign: true, population: 109300000 },
]

function getGeographicHint(target: CountryChallenge, selected: CountryChallenge | undefined) {
  if (!selected) return null

  const hints: string[] = []
  if (target.continent === selected.continent) {
    hints.push('Está en el mismo continente.')
  } else {
    hints.push('Está en otro continente.')
  }

  if (selected.alpha3 && target.borders?.includes(selected.alpha3)) {
    hints.push(`Es limítrofe con ${selected.country}.`)
  } else if (target.coordinates && selected.coordinates) {
    const toRadians = (degrees: number) => degrees * Math.PI / 180
    const [targetLatitude, targetLongitude] = target.coordinates
    const [selectedLatitude, selectedLongitude] = selected.coordinates
    const latitudeDifference = toRadians(selectedLatitude - targetLatitude)
    const longitudeDifference = toRadians(selectedLongitude - targetLongitude)
    const haversine = Math.sin(latitudeDifference / 2) ** 2
      + Math.cos(toRadians(targetLatitude))
      * Math.cos(toRadians(selectedLatitude))
      * Math.sin(longitudeDifference / 2) ** 2
    const centralAngle = 2 * Math.atan2(
      Math.sqrt(Math.min(1, haversine)),
      Math.sqrt(1 - Math.min(1, haversine)),
    )
    const distanceKm = 6371 * centralAngle

    hints.push(distanceKm < 1000 ? 'Está muy cerca.' : distanceKm > 5000 ? 'Está muy lejos.' : 'Está a una distancia intermedia.')
  }

  return hints.join(' ')
}

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [leaderboardDifficulty, setLeaderboardDifficulty] = useState<Difficulty>('easy')
  const [screen, setScreen] = useState<'home' | 'game'>('home')
  const [challenges, setChallenges] = useState<CountryChallenge[]>(INITIAL_FALLBACK)
  const [countryDirectory, setCountryDirectory] = useState<CountryChallenge[]>(INITIAL_FALLBACK)
  const [challengeIndex, setChallengeIndex] = useState(0)
  const [answer, setAnswer] = useState<'correct' | 'wrong' | null>(null)
  const [selectedNumericCode, setSelectedNumericCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [roundComplete, setRoundComplete] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [mistakeCount, setMistakeCount] = useState(0)
  const [score, setScore] = useState(0)
  const [guessedCountryNumericCodes, setGuessedCountryNumericCodes] = useState<string[]>([])
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>(readLeaderboard)
  const [gameStartedAt, setGameStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [gameDurationSeconds, setGameDurationSeconds] = useState(0)

  useEffect(() => {
    if (screen !== 'game' || roundComplete || gameOver || gameStartedAt === null) return

    const updateElapsedTime = () => {
      setElapsedSeconds(Math.floor((Date.now() - gameStartedAt) / 1000))
    }
    updateElapsedTime()
    const intervalId = window.setInterval(updateElapsedTime, 1000)
    return () => window.clearInterval(intervalId)
  }, [gameOver, gameStartedAt, roundComplete, screen])

  const currentChallenge = challenges[challengeIndex] || challenges[0]
  const selectedCountry = countryDirectory.find((country) => country.numericCode === selectedNumericCode)
  const geographicHint = answer === 'wrong' && difficulty === 'easy'
    ? getGeographicHint(currentChallenge, selectedCountry)
    : null
  const mistakeLimit = 5

  async function startNewGame() {
    setIsLoading(true)
    setRoundComplete(false)
    setGameOver(false)
    setMistakeCount(0)
    setAnswer(null)
    setSelectedNumericCode(null)
    setScore(0)
    setGuessedCountryNumericCodes([])
    setCurrentStreak(0)
    setBestStreak(0)
    setChallengeIndex(0)
    setElapsedSeconds(0)
    setGameDurationSeconds(0)

    try {
      setCountryDirectory(await fetchAllCountries())
      const newChallenges = await getRandomChallenges(totalCountries)
      setChallenges(newChallenges)
      setGameStartedAt(Date.now())
      setScreen('game')
    } catch (err) {
      console.error('Error al generar desafíos:', err)
      setChallenges(INITIAL_FALLBACK)
      setGameStartedAt(Date.now())
      setScreen('game')
    } finally {
      setIsLoading(false)
    }
  }

  function recordGameResult() {
    const durationSeconds = gameStartedAt === null
      ? elapsedSeconds
      : Math.floor((Date.now() - gameStartedAt) / 1000)
    const entry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      playerName: 'Jugador local',
      streak: bestStreak,
      durationSeconds,
      difficulty,
    }
    setGameDurationSeconds(durationSeconds)
    const currentModeEntries = [...leaderboardEntries.filter((result) => result.difficulty === difficulty), entry]
      .sort((first, second) => second.streak - first.streak || first.durationSeconds - second.durationSeconds)
      .slice(0, 10)
    const otherModeEntries = leaderboardEntries.filter((result) => result.difficulty !== difficulty)
    const updatedEntries = [...otherModeEntries, ...currentModeEntries]
    setLeaderboardEntries(updatedEntries)
    try {
      localStorage.setItem(leaderboardStorageKey, JSON.stringify(updatedEntries))
    } catch (error) {
      console.warn('No se pudo guardar la leaderboard local:', error)
    }
  }

  function chooseCountry(numericCode: string) {
    if (answer === 'correct' || gameOver) return
    setSelectedNumericCode(numericCode)
    const isCorrect = numericCode === currentChallenge.numericCode
    if (isCorrect) {
      const nextStreak = currentStreak + 1
      setScore((prev) => prev + 1)
      setGuessedCountryNumericCodes((previous) => [...previous, numericCode])
      setCurrentStreak(nextStreak)
      setBestStreak((best) => Math.max(best, nextStreak))
      setAnswer('correct')
    } else {
      const nextMistakeCount = mistakeCount + 1
      setMistakeCount(nextMistakeCount)
      setCurrentStreak(0)
      setAnswer('wrong')
      if (nextMistakeCount >= mistakeLimit) {
        recordGameResult()
        setGameOver(true)
      }
    }
  }

  function nextChallenge() {
    if (challengeIndex + 1 < challenges.length) {
      setChallengeIndex((prev) => prev + 1)
      setAnswer(null)
      setSelectedNumericCode(null)
    } else {
      recordGameResult()
      setRoundComplete(true)
    }
  }

  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  const visibleLeaderboard = leaderboardEntries
    .filter((entry) => entry.difficulty === leaderboardDifficulty)
    .sort((first, second) => second.streak - first.streak || first.durationSeconds - second.durationSeconds)

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" type="button" onClick={() => setScreen('home')} aria-label="FlagQuest, volver al inicio">
          <span className="wordmark-icon" aria-hidden="true"><span /></span>
          <span>FLAG<span className="wordmark-accent">QUEST</span></span>
        </button>
      </header>

      {screen === 'home' ? (
        <section className="home-screen">
          <div className="intro-copy">
            <h1>El mundo<br />está en juego<span className="title-period">.</span></h1>
            <p className="intro-description">Una bandera. Un mapa. ¿Cuántos países podés reconocer?</p>
            <div className="home-rule"><span /></div>
            <div className="mode-heading">
              <h2>Elegí tu dificultad</h2>
            </div>
            <div className="difficulty-options" role="group" aria-label="Dificultad">
              <button
                className={`difficulty-option ${difficulty === 'easy' ? 'selected' : ''}`}
                type="button"
                aria-pressed={difficulty === 'easy'}
                onClick={() => setDifficulty('easy')}
              >
                <span className="option-mark easy-mark">E</span>
                <span className="option-copy"><strong>Normal</strong><small>Nombres en el mapa y pistas activadas</small></span>
                <span className="radio-mark" />
              </button>
              <button
                className={`difficulty-option ${difficulty === 'hard' ? 'selected' : ''}`}
                type="button"
                aria-pressed={difficulty === 'hard'}
                onClick={() => setDifficulty('hard')}
              >
                <span className="option-mark hard-mark">D</span>
                <span className="option-copy"><strong>Difícil</strong><small>Sin nombres, sin pistas</small></span>
                <span className="radio-mark" />
              </button>
            </div>
            <button
              className="start-button"
              type="button"
              disabled={isLoading}
              onClick={startNewGame}
            >
              <span>{isLoading ? 'CARGANDO PAÍSES...' : 'INICIAR PARTIDA'}</span>
              <span className="start-arrow" aria-hidden="true">→</span>
            </button>
          </div>

          <aside className="leaderboard-panel" aria-label="Leaderboard">
            <div className="leaderboard-heading">
              <span>RANKING LOCAL</span>
              <h2>Leaderboard</h2>
            </div>
            <div className="leaderboard-tabs" role="group" aria-label="Filtrar leaderboard por dificultad">
              <button
                type="button"
                aria-pressed={leaderboardDifficulty === 'easy'}
                className={leaderboardDifficulty === 'easy' ? 'selected' : ''}
                onClick={() => setLeaderboardDifficulty('easy')}
              >Normal</button>
              <button
                type="button"
                aria-pressed={leaderboardDifficulty === 'hard'}
                className={leaderboardDifficulty === 'hard' ? 'selected' : ''}
                onClick={() => setLeaderboardDifficulty('hard')}
              >Difícil</button>
            </div>
            <table className="leaderboard-table">
              <thead>
                <tr><th>Jugador</th><th>Racha</th><th>Tiempo</th></tr>
              </thead>
              <tbody>
                {visibleLeaderboard.map((entry, index) => (
                  <tr key={entry.id}>
                    <td><span className="leaderboard-rank">{String(index + 1).padStart(2, '0')}</span>{entry.playerName}</td>
                    <td>{entry.streak}</td>
                    <td>{formatDuration(entry.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleLeaderboard.length === 0 && (
              <p className="leaderboard-empty">Todavía no hay partidas en este modo. Tu resultado aparecerá acá.</p>
            )}
            <p className="leaderboard-note">MEJOR RACHA · PARTIDAS DE ESTE NAVEGADOR</p>
          </aside>
        </section>
      ) : roundComplete ? (
        <section className="completion-view">
          <p className="eyebrow"><span>02</span> · RESUMEN DE PARTIDA</p>
          <h2>¡Ronda Completada!</h2>
          <p>
            Identificaste <strong>{score}</strong> de <strong>{challenges.length}</strong> países correctamente.
          </p>
          <div className="completion-stats">
            <span>MEJOR RACHA <strong>{bestStreak}</strong></span>
            <span>TIEMPO <strong>{formatDuration(gameDurationSeconds)}</strong></span>
          </div>
          <div className="completion-actions">
            <button className="start-button" type="button" onClick={startNewGame}>
              <span>NUEVA RONDA CON OTROS PAÍSES</span>
              <span className="start-arrow" aria-hidden="true">→</span>
            </button>
            <button className="text-button" type="button" onClick={() => setScreen('home')}>
              Volver al inicio
            </button>
          </div>
        </section>
      ) : (
        <section className="game-screen">
          <div className="game-heading">
            <div>
              <p className="eyebrow"><span>02</span> · PARTIDA CONECTADA A API</p>
              <h1>¿Dónde está?</h1>
            </div>
            <div className="game-stats">
              <div><span>PAÍSES ADIVINADOS</span><strong>{score}/{totalCountries}</strong></div>
              <div><span>RACHA ACTUAL</span><strong>{currentStreak}</strong></div>
              <div><span>ERRORES</span><strong>{mistakeCount}/{mistakeLimit}</strong></div>
              <div><span>TIEMPO</span><strong>{formatDuration(elapsedSeconds)}</strong></div>
            </div>
          </div>
          <div className="game-layout">
            <aside className="challenge-panel">
              <div className="challenge-topline">
                <span>ENCONTRÁ ESTE PAÍS</span>
                <span className="challenge-number">#{String(challengeIndex + 1).padStart(3, '0')}</span>
              </div>

              <div className="large-flag" aria-label={`Bandera de ${currentChallenge.country}`}>
                <img
                  src={currentChallenge.flagUrl}
                  alt={`Bandera de ${currentChallenge.country}`}
                />
              </div>

              <div className="challenge-prompt">
                <span className="prompt-marker">?</span>
                <p>Hacé click en el mapa<br />donde creés que está.</p>
              </div>

              <div className={`answer-message ${answer ?? ''}`} aria-live="polite">
                {answer === 'correct' && (
                  <>
                    <strong>¡Bien ubicado!</strong>
                    <span>La bandera es de <b>{currentChallenge.country}</b>.</span>
                  </>
                )}
                {answer === 'wrong' && (
                  <>
                    <strong>Por ahí no</strong>
                    <span>
                      {mistakeCount < mistakeLimit
                        ? `Racha reiniciada. Te quedan ${mistakeLimit - mistakeCount} errores.`
                        : 'Límite de errores alcanzado.'}
                    </span>
                    {geographicHint && <span className="geographic-hint">Pista: {geographicHint}</span>}
                  </>
                )}
                {!answer && (
                  <>
                    <strong>Tu turno</strong>
                    <span>
                      {difficulty === 'easy'
                        ? 'Explorá el mapa para ver los nombres de los países.'
                        : 'Esta vez, confiá en tu memoria geográfica.'}
                    </span>
                  </>
                )}
              </div>

              {answer === 'correct' ? (
                <button className="next-button" type="button" onClick={nextChallenge}>
                  {challengeIndex + 1 === challenges.length ? 'VER RESULTADOS' : 'SIGUIENTE BANDERA'} <span>→</span>
                </button>
              ) : (
                <div className="difficulty-chip">
                  <span className={difficulty === 'easy' ? 'chip-easy' : 'chip-hard'}>
                    {difficulty === 'easy' ? 'NORMAL' : 'DIFÍCIL'}
                  </span>
                  <span>·</span>
                  <span>{difficulty === 'easy' ? 'PISTAS ACTIVAS' : 'SIN PISTAS'}</span>
                </div>
              )}
            </aside>

            <div className="map-panel">
              <div className="map-panel-header">
                <span><i /> MAPA DE PAÍSES</span>
                <span>GOOGLE MAPS · ISO NUMÉRICO</span>
              </div>
              <div className="interactive-map">
                <GoogleCountryMap
                  targetCountryNumericCode={currentChallenge.numericCode}
                  selectedNumericCode={selectedNumericCode}
                  isCorrect={answer === 'correct'}
                  showCountryNames={difficulty === 'easy'}
                  guessedCountryNumericCodes={guessedCountryNumericCodes}
                  showGuessedCountries={difficulty === 'easy'}
                  onCountryClick={chooseCountry}
                />
              </div>
              <div className="map-panel-footer">
                <span>
                  <i /> {difficulty === 'easy' ? 'MODO NORMAL · NOMBRES VISIBLES' : 'MODO DIFÍCIL · NOMBRES OCULTOS'}
                </span>
                <span>PAÍSES SELECCIONABLES · GOOGLE MAPS</span>
              </div>
            </div>
          </div>
        </section>
      )}
      {screen === 'game' && gameOver && (
        <div className="game-over-backdrop">
          <section className="game-over-dialog" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
            <p className="eyebrow">02 · RESUMEN DE PARTIDA</p>
            <h2 id="game-over-title">Fin de la partida</h2>
            <div className="game-over-stats">
              <div><span>RACHA</span><strong>{bestStreak} países</strong></div>
              <div><span>TIEMPO</span><strong>{formatDuration(gameDurationSeconds)}</strong></div>
            </div>
            <div className="game-over-actions">
              <button className="start-button" type="button" disabled={isLoading} onClick={startNewGame}>
                <span>VOLVER A JUGAR</span><span className="start-arrow" aria-hidden="true">→</span>
              </button>
              <button className="text-button" type="button" onClick={() => setScreen('home')}>
                Volver a la leaderboard
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
