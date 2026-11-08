import { useState, useEffect, useRef, type FormEvent } from 'react'
import './App.css'
import { GoogleCountryMap } from './components/GoogleCountryMap'
import {
  fetchAllCountries,
  getRandomChallenges,
  type CountryChallenge,
} from './services/countriesApi'
import {
  getLeaderboardFromApi,
  saveScoreToApi,
  deleteScoreFromApi,
  type LeaderboardEntry,
  type Difficulty,
} from './services/leaderboardApi'
import {
  getCurrentUser,
  getStoredAuthToken,
  loginAccount,
  logoutAccount,
  registerAccount,
  storeAuthToken,
  type AuthUser,
} from './services/authApi'

const totalCountries = 195

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
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const accountMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [authToken, setAuthToken] = useState<string | null>(() => getStoredAuthToken())
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isAuthChecking, setIsAuthChecking] = useState(() => Boolean(getStoredAuthToken()))
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPasswordConfirmation, setAuthPasswordConfirmation] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [leaderboardDifficulty, setLeaderboardDifficulty] = useState<Difficulty>('easy')
  const [screen, setScreen] = useState<'home' | 'auth' | 'game'>('home')
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
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([])
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false)
  const [gameStartedAt, setGameStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [gameDurationSeconds, setGameDurationSeconds] = useState(0)

  useEffect(() => {
    if (!isAccountMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false)
        accountMenuButtonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAccountMenuOpen])

  useEffect(() => {
    if (!authToken) return

    let ignore = false
    getCurrentUser(authToken)
      .then(({ user }) => {
        if (!ignore) setAuthUser(user)
      })
      .catch((error: unknown) => {
        if (!ignore) {
          console.warn('No se pudo validar la sesión guardada:', error)
          storeAuthToken(null)
          setAuthToken(null)
          setAuthUser(null)
          setAuthError('No se pudo validar la sesión. Iniciá sesión nuevamente o continuá como invitado.')
        }
      })
      .finally(() => {
        if (!ignore) setIsAuthChecking(false)
      })

    return () => {
      ignore = true
    }
  }, [authToken])

  const refreshLeaderboard = (mode: Difficulty) => {
    setIsLeaderboardLoading(true)
    getLeaderboardFromApi(mode)
      .then((data) => {
        setLeaderboardEntries(data)
      })
      .finally(() => {
        setIsLeaderboardLoading(false)
      })
  }

  useEffect(() => {
    let ignore = false
    getLeaderboardFromApi(leaderboardDifficulty)
      .then((data) => {
        if (!ignore) {
          setLeaderboardEntries(data)
        }
      })
      .catch((err) => {
        console.error('Error al consultar leaderboard:', err)
      })
      .finally(() => {
        if (!ignore) {
          setIsLeaderboardLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [leaderboardDifficulty])

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
  const mistakeLimit = difficulty === 'normal' ? 4 : 5

  async function startNewGame() {
    if (isAuthChecking) return
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

  async function recordGameResult() {
    const durationSeconds = gameStartedAt === null
      ? elapsedSeconds
      : Math.floor((Date.now() - gameStartedAt) / 1000)
    setGameDurationSeconds(durationSeconds)

    if (!authToken || !authUser) return

    try {
      await saveScoreToApi(authToken, authUser.username, bestStreak, durationSeconds, difficulty)
      if (difficulty === leaderboardDifficulty) {
        refreshLeaderboard(difficulty)
      }
    } catch (error) {
      console.warn('Error al guardar puntaje en la base de datos:', error)
    }
  }

  async function handleDeleteScore(id: string | number) {
    if (!window.confirm('¿Deseas eliminar este registro de la base de datos?')) return
    if (!authToken) return
    await deleteScoreFromApi(id, authToken)
    refreshLeaderboard(leaderboardDifficulty)
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError(null)

    if (authMode === 'register' && authPassword !== authPasswordConfirmation) {
      setAuthError('Las contraseñas no coinciden.')
      return
    }

    setAuthLoading(true)
    try {
      const session = authMode === 'register'
        ? await registerAccount(authUsername, authPassword)
        : await loginAccount(authUsername, authPassword)
      storeAuthToken(session.token)
      setAuthToken(session.token)
      setAuthUser(session.user)
      setAuthPassword('')
      setAuthPasswordConfirmation('')
      setAuthError(null)
      setScreen('home')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'No se pudo completar la autenticación.')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogout() {
    const token = authToken
    storeAuthToken(null)
    setAuthToken(null)
    setAuthUser(null)
    setIsAccountMenuOpen(false)
    setIsAuthChecking(false)
    setScreen('home')
    if (token) {
      void logoutAccount(token).catch((error: unknown) => {
        console.warn('No se pudo cerrar la sesión en el servidor:', error)
      })
    }
  }

  function openAuthScreen() {
    setAuthMode('login')
    setAuthError(null)
    setAuthPassword('')
    setAuthPasswordConfirmation('')
    setScreen('auth')
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" type="button" onClick={() => setScreen('home')} aria-label="FlagQuest, volver al inicio">
          <span className="wordmark-icon" aria-hidden="true"><span /></span>
          <span>FLAG<span className="wordmark-accent">QUEST</span></span>
        </button>
        <div className="topbar-right">
          {authUser ? (
            <div className="account-menu" ref={accountMenuRef}>
              <button
                className="account-menu-trigger"
                type="button"
                ref={accountMenuButtonRef}
                aria-label={`Menú de cuenta de ${authUser.username}`}
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
              >
                <span aria-hidden="true">{authUser.username === 'Ando' ? '🐴' : '👤'}</span>
                <span className="account-menu-label">{authUser.username}</span>
              </button>
              {isAccountMenuOpen && (
                <div className="account-menu-dropdown" role="menu">
                  <span className="account-menu-username">{authUser.username}</span>
                  <button className="account-menu-logout" type="button" role="menuitem" onClick={handleLogout}>
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : screen === 'home' ? (
            <button className="text-button login-link" type="button" onClick={openAuthScreen}>Iniciar sesión</button>
          ) : null}
        </div>
      </header>

      {screen === 'auth' ? (
        <section className="auth-screen">
          <form className="auth-panel" onSubmit={(event) => void handleAuthSubmit(event)}>
            <p className="eyebrow"><span>CUENTA FLAGQUEST</span></p>
            <h1>{authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
            <p className="auth-description">
              {authMode === 'login'
                ? 'Ingresá tus credenciales para guardar tus resultados y aparecer en la leaderboard.'
                : 'Creá una cuenta para guardar tus partidas y competir en la leaderboard.'}
            </p>
            <label className="auth-field">
              <span>Nombre de usuario</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                minLength={3}
                maxLength={20}
                required
              />
            </label>
            <label className="auth-field">
              <span>Contraseña</span>
              <input
                type="password"
                name="password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            {authMode === 'register' && (
              <label className="auth-field">
                <span>Repetí la contraseña</span>
                <input
                  type="password"
                  name="password-confirmation"
                  autoComplete="new-password"
                  value={authPasswordConfirmation}
                  onChange={(event) => setAuthPasswordConfirmation(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
            )}
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            <button className="start-button auth-submit" type="submit" disabled={authLoading}>
              <span>{authLoading ? 'PROCESANDO...' : authMode === 'login' ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}</span>
              <span className="start-arrow" aria-hidden="true">→</span>
            </button>
            <p className="auth-switch">
              {authMode === 'login' ? '¿Todavía no tenés cuenta?' : '¿Ya tenés cuenta?'}
              {' '}
              <button
                className="inline-button"
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login')
                  setAuthError(null)
                  setAuthPassword('')
                  setAuthPasswordConfirmation('')
                }}
              >
                {authMode === 'login' ? 'Crear una cuenta' : 'Iniciar sesión'}
              </button>
            </p>
          </form>
        </section>
      ) : screen === 'home' ? (
        <section className="home-screen">
          <div className="intro-copy">
            <h1>El mundo<br />está en juego<span className="title-period">.</span></h1>
            <p className="intro-description">Una bandera. Un mapa. ¿Cuántos países podés reconocer?</p>
            <div className="home-rule"><span /></div>
            {authError && <p className="auth-error home-auth-error" role="alert">{authError}</p>}

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
                <span className="option-mark easy-mark">F</span>
                <span className="option-copy"><strong>Fácil</strong><small>Nombres en el mapa y pistas activadas</small></span>
                <span className="radio-mark" />
              </button>
              <button
                className={`difficulty-option ${difficulty === 'normal' ? 'selected' : ''}`}
                type="button"
                aria-pressed={difficulty === 'normal'}
                onClick={() => setDifficulty('normal')}
              >
                <span className="option-mark normal-mark">N</span>
                <span className="option-copy"><strong>Normal</strong><small>Nombres en el mapa, sin pistas</small></span>
                <span className="radio-mark" />
              </button>
              <button
                className={`difficulty-option ${difficulty === 'hard' ? 'selected' : ''}`}
                type="button"
                aria-pressed={difficulty === 'hard'}
                onClick={() => setDifficulty('hard')}
              >
                <span className="option-mark hard-mark">D</span>
                <span className="option-copy"><strong>Difícil</strong><small>Sin nombres y sin pistas</small></span>
                <span className="radio-mark" />
              </button>
            </div>
            <button
              className="start-button"
              type="button"
              disabled={isLoading || isAuthChecking}
              onClick={startNewGame}
            >
              <span>{isLoading ? 'CARGANDO PAÍSES...' : 'INICIAR PARTIDA'}</span>
              <span className="start-arrow" aria-hidden="true">→</span>
            </button>
            {!authUser && <p className="guest-note">Vas a jugar como invitado. Tu puntaje no se guardará en la leaderboard.</p>}
          </div>

          <aside className="leaderboard-panel" aria-label="Leaderboard">
            <div className="leaderboard-heading">
              <span>BASE DE DATOS · SQLITE</span>
              <h2>Leaderboard</h2>
            </div>
            <div className="leaderboard-tabs" role="group" aria-label="Filtrar leaderboard por dificultad">
              <button
                type="button"
                aria-pressed={leaderboardDifficulty === 'easy'}
                className={leaderboardDifficulty === 'easy' ? 'selected' : ''}
                onClick={() => setLeaderboardDifficulty('easy')}
              >Fácil</button>
              <button
                type="button"
                aria-pressed={leaderboardDifficulty === 'normal'}
                className={leaderboardDifficulty === 'normal' ? 'selected' : ''}
                onClick={() => setLeaderboardDifficulty('normal')}
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
                <tr>
                  <th>Jugador</th>
                  <th>Racha</th>
                  <th>Tiempo</th>
                  <th style={{ width: '28px', textAlign: 'center' }}>ABM</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeaderboard.map((entry, index) => (
                  <tr key={entry.id}>
                    <td><span className="leaderboard-rank">{String(index + 1).padStart(2, '0')}</span>{entry.playerName}</td>
                    <td>{entry.streak}</td>
                    <td>{formatDuration(entry.durationSeconds)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {authUser && entry.user_id === authUser.id && (
                        <button
                          type="button"
                          className="delete-score-btn"
                          title="Eliminar partida (Baja en base de datos)"
                          onClick={() => handleDeleteScore(entry.id)}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isLeaderboardLoading && (
              <p className="leaderboard-empty">Consultando base de datos SQLite...</p>
            )}
            {!isLeaderboardLoading && visibleLeaderboard.length === 0 && (
              <p className="leaderboard-empty">Todavía no hay partidas guardadas en este modo. Tu resultado aparecerá acá.</p>
            )}
            <p className="leaderboard-note">RANKING EN TIEMPO REAL · PERSISTENCIA EN SQLITE</p>
          </aside>
        </section>
      ) : roundComplete ? (
        <section className="completion-view">
          <p className="eyebrow"><span>02</span> · RESUMEN DE PARTIDA</p>
          <h2>¡Ronda Completada!</h2>
          <p>
            Identificaste <strong>{score}</strong> de <strong>{challenges.length}</strong> países correctamente.
          </p>
          {!authUser && <p className="guest-note">Jugaste como invitado: este puntaje no se guardó.</p>}
          <div className="completion-stats">
            <span>MEJOR RACHA <strong>{bestStreak}</strong></span>
            <span>TIEMPO <strong>{formatDuration(gameDurationSeconds)}</strong></span>
          </div>
          <div className="completion-actions">
            <button className="start-button" type="button" disabled={isLoading || isAuthChecking} onClick={startNewGame}>
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
              <p className="eyebrow"><span>02</span> · {authUser ? 'PARTIDA CON CUENTA' : 'PARTIDA COMO INVITADO'}</p>
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
                      {difficulty !== 'hard'
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
                  <span className={difficulty === 'hard' ? 'chip-hard' : 'chip-easy'}>
                    {difficulty === 'easy' ? 'FÁCIL' : difficulty === 'normal' ? 'NORMAL' : 'DIFÍCIL'}
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
                  showCountryNames={difficulty !== 'hard'}
                  guessedCountryNumericCodes={guessedCountryNumericCodes}
                  showGuessedCountries={difficulty !== 'hard'}
                  onCountryClick={chooseCountry}
                />
              </div>
              <div className="map-panel-footer">
                <span>
                  <i /> {difficulty === 'hard' ? 'MODO DIFÍCIL · NOMBRES OCULTOS' : `MODO ${difficulty === 'easy' ? 'FÁCIL' : 'NORMAL'} · NOMBRES VISIBLES`}
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
            {!authUser && <p className="guest-note">Jugaste como invitado: este puntaje no se guardó.</p>}
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
