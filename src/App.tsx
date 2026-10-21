import { useState, useEffect, type KeyboardEvent } from 'react'
import './App.css'
import {
  getRandomChallenges,
  fetchAllCountries,
  type Continent,
  type CountryChallenge,
} from './services/countriesApi'

type Difficulty = 'easy' | 'hard'

const INITIAL_FALLBACK: CountryChallenge[] = [
  { id: 'jp', country: 'Japón', continent: 'Asia', capital: 'Tokio', flagUrl: 'https://flagcdn.com/w640/jp.png', code: 'JP', population: 125800000 },
  { id: 'br', country: 'Brasil', continent: 'América del Sur', capital: 'Brasilia', flagUrl: 'https://flagcdn.com/w640/br.png', code: 'BR', population: 214300000 },
  { id: 'eg', country: 'Egipto', continent: 'África', capital: 'El Cairo', flagUrl: 'https://flagcdn.com/w640/eg.png', code: 'EG', population: 109300000 },
]

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [screen, setScreen] = useState<'home' | 'game'>('home')
  const [challenges, setChallenges] = useState<CountryChallenge[]>(INITIAL_FALLBACK)
  const [challengeIndex, setChallengeIndex] = useState(0)
  const [hoveredContinent, setHoveredContinent] = useState<Continent | null>(null)
  const [answer, setAnswer] = useState<'correct' | 'wrong' | null>(null)
  const [previewCountry, setPreviewCountry] = useState<CountryChallenge>(INITIAL_FALLBACK[0])
  const [isLoading, setIsLoading] = useState(false)
  const [isApiReady, setIsApiReady] = useState(false)
  const [roundComplete, setRoundComplete] = useState(false)
  const [score, setScore] = useState(0)

  // Cargar datos de la API al montar la aplicación
  useEffect(() => {
    let isMounted = true
    async function loadApiData() {
      try {
        const countries = await fetchAllCountries()
        if (isMounted && countries.length > 0) {
          setIsApiReady(true)
          // Elegir país aleatorio para la vista previa en Inicio
          const randomPreview = countries[Math.floor(Math.random() * countries.length)]
          setPreviewCountry(randomPreview)
        }
      } catch (err) {
        console.error('Error inicializando API de países:', err)
      }
    }
    loadApiData()
    return () => {
      isMounted = false
    }
  }, [])

  const currentChallenge = challenges[challengeIndex] || challenges[0]

  async function startNewGame() {
    setIsLoading(true)
    setRoundComplete(false)
    setAnswer(null)
    setScore(0)
    setChallengeIndex(0)

    try {
      const newChallenges = await getRandomChallenges(5)
      setChallenges(newChallenges)
      setScreen('game')
    } catch (err) {
      console.error('Error al generar desafíos:', err)
      setChallenges(INITIAL_FALLBACK)
      setScreen('game')
    } finally {
      setIsLoading(false)
    }
  }

  function chooseContinent(continent: Continent) {
    if (answer === 'correct') return
    const isCorrect = continent === currentChallenge.continent
    if (isCorrect) {
      setScore((prev) => prev + 1)
      setAnswer('correct')
    } else {
      setAnswer('wrong')
    }
  }

  function activateContinent(event: KeyboardEvent<SVGPathElement>, continent: Continent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      chooseContinent(continent)
    }
  }

  function nextChallenge() {
    if (challengeIndex + 1 < challenges.length) {
      setChallengeIndex((prev) => prev + 1)
      setAnswer(null)
    } else {
      setRoundComplete(true)
    }
  }

  function formatPopulation(pop?: number) {
    if (!pop) return 'No disponible'
    return new Intl.NumberFormat('es-AR').format(pop) + ' hab.'
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" type="button" onClick={() => setScreen('home')} aria-label="FlagQuest, volver al inicio">
          <span className="wordmark-icon" aria-hidden="true"><span /></span>
          <span>FLAG<span className="wordmark-accent">QUEST</span></span>
        </button>
        <div className="topbar-right">
          <span className="api-badge" title="Consumiendo datos vía API">
            <i /> {isApiReady ? 'API REST CONECTADA' : 'CARGANDO API...'}
          </span>
          <span className="build-tag"><i /> DEMO FULL</span>
          {screen === 'game' && (
            <button className="text-button" type="button" onClick={() => setScreen('home')}>
              ← Menú principal
            </button>
          )}
        </div>
      </header>

      {screen === 'home' ? (
        <section className="home-screen">
          <div className="intro-copy">
            <p className="eyebrow"><span>01</span> · ATLAS DE BOLSILLO</p>
            <h1>El mundo<br />está en juego<span className="title-period">.</span></h1>
            <p className="intro-description">Una bandera. Un mapa. ¿Cuántos países podés reconocer?</p>
            <div className="home-rule"><span /></div>
            <div className="mode-heading">
              <div><span className="section-index">A</span><h2>Elegí tu dificultad</h2></div>
              <span className="mode-note">PODÉS CAMBIARLA DESPUÉS</span>
            </div>
            <div className="difficulty-options" role="group" aria-label="Dificultad">
              <button
                className={`difficulty-option ${difficulty === 'easy' ? 'selected' : ''}`}
                type="button"
                aria-pressed={difficulty === 'easy'}
                onClick={() => setDifficulty('easy')}
              >
                <span className="option-mark easy-mark">E</span>
                <span className="option-copy"><strong>Fácil</strong><small>Los nombres aparecen al explorar</small></span>
                <span className="radio-mark" />
              </button>
              <button
                className={`difficulty-option ${difficulty === 'hard' ? 'selected' : ''}`}
                type="button"
                aria-pressed={difficulty === 'hard'}
                onClick={() => setDifficulty('hard')}
              >
                <span className="option-mark hard-mark">D</span>
                <span className="option-copy"><strong>Difícil</strong><small>Sin pistas al pasar el cursor</small></span>
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
            <p className="session-note">
              <span className="pixel-star">✦</span> Datos globales en tiempo real vía API pública
            </p>
          </div>

          <aside className="preview-panel" aria-label="Vista previa del juego">
            <div className="panel-topline">
              <span>VISTA PREVIA</span>
              <span className="panel-coordinates">CÓDIGO: {previewCountry.code || 'ISO'}</span>
            </div>
            <div className="preview-map" aria-hidden="true">
              <div className="map-grid" />
              <svg className="preview-world" viewBox="0 0 600 330" role="presentation">
                <path d="M69 91 93 65l34-13 20 12 25-4 22 18-12 20 17 17-11 17-27 3-14 24-22 9-4 27-18 20-13-14 2-24-18-18-2-27-19-17 5-26-10-22 21-20Z" />
                <path d="m179 179 26 10 18 20-2 24 16 24-8 24-17 19-8 36-16 13-11-26-3-35-16-28 3-35-11-27 9-19Z" />
                <path d="m268 84 22-17 30 5 9 18-20 12-24-3-17 9-18-8Z" />
                <path d="m288 127 22-14 35 6 17 21 20 12 9 29-14 23-5 39-19 29-20-8-16-28-3-30-18-17-11-28-17-10Z" />
                <path d="m343 85 42-24 57 9 29 19 53 9 15 25-18 17-30-11-15 14-23-6-20 21-17-6-17 17-20-13-6-22-25-12-15-20-25 1-14-10Z" />
                <path d="m472 223 21-10 23 8 15 18-12 20-26 4-18-13-10-14Z" />
                <path d="m568 264 7-4 6 8-7 7-7-4Z" />
              </svg>
              <div className="map-label label-west">PACÍFICO</div>
              <div className="map-label label-east">OCÉANO<br />ÍNDICO</div>
              <div className="map-pin"><span /><i /></div>
              <div className="map-caption"><span className="caption-dot" /> MAPA INTERACTIVO DINÁMICO</div>
            </div>
            <div className="preview-bottom">
              <div className="flag-preview">
                <span className="flag-label">BANDERA DEL DÍA (API)</span>
                <div className="sample-flag" aria-label={`Bandera de ${previewCountry.country}`}>
                  <img src={previewCountry.flagUrl} alt={`Bandera de ${previewCountry.country}`} />
                </div>
              </div>
              <div className="preview-separator" />
              <div className="preview-copy">
                <span>EJEMPLO ACTIVO</span>
                <strong>{previewCountry.country}</strong>
                <small>{previewCountry.continent} · Capital: {previewCountry.capital}</small>
              </div>
              <span className="pixel-compass" aria-hidden="true">N<br /><b>✦</b></span>
            </div>
            <div className="panel-footnote">
              <span>FQ-REST</span>
              <span>POBLACIÓN: {formatPopulation(previewCountry.population)}</span>
              <span>◆</span>
            </div>
          </aside>
          <div className="home-footer">
            <span>CONSUMO DE DATOS MEDIANTE API PÚBLICA DE PAÍSES Y BANDERAS</span>
            <span>HECHO CON CURIOSIDAD <b>✳</b></span>
          </div>
        </section>
      ) : roundComplete ? (
        <section className="completion-view">
          <p className="eyebrow"><span>02</span> · RESUMEN DE PARTIDA</p>
          <h2>¡Ronda Completada!</h2>
          <p>
            Identificaste <strong>{score}</strong> de <strong>{challenges.length}</strong> países correctamente.
          </p>
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
            <div className="round-counter">
              <span>DESAFÍO</span>
              <strong>0{challengeIndex + 1}<i> / 0{challenges.length}</i></strong>
            </div>
          </div>
          <div className="game-layout">
            <aside className="challenge-panel">
              <div className="challenge-topline">
                <span>ENCONTRÁ ESTE PAÍS</span>
                <span className="challenge-number">#{String(challengeIndex + 1).padStart(2, '0')}</span>
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
                    <div className="country-trivia">
                      <span>🏛 <b>Capital:</b> {currentChallenge.capital}</span>
                      <span>👥 <b>Población:</b> {formatPopulation(currentChallenge.population)}</span>
                      <span>🌍 <b>Continente:</b> {currentChallenge.continent}</span>
                    </div>
                  </>
                )}
                {answer === 'wrong' && (
                  <>
                    <strong>Por ahí no</strong>
                    <span>Probá con otra región del mapa.</span>
                  </>
                )}
                {!answer && (
                  <>
                    <strong>Tu turno</strong>
                    <span>
                      {difficulty === 'easy'
                        ? 'Explorá el mapa para ver pistas de continentes.'
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
                    {difficulty === 'easy' ? 'FÁCIL' : 'DIFÍCIL'}
                  </span>
                  <span>·</span>
                  <span>{difficulty === 'easy' ? 'PISTAS ACTIVAS' : 'SIN PISTAS'}</span>
                </div>
              )}
            </aside>

            <div className="map-panel">
              <div className="map-panel-header">
                <span><i /> MAPA DE REGIONES</span>
                <span>PARTIDA DINÁMICA · API REST</span>
              </div>
              <div className="interactive-map">
                <div className="map-grid" />
                <svg viewBox="0 0 900 500" className="continent-map" aria-label="Mapa de regiones seleccionables">
                  <path
                    className={hoveredContinent === 'América del Norte' ? 'continent hovered' : 'continent'}
                    d="M104 105 137 69l48-26 33 9 37-11 34 24 35 2 23 30-19 29 24 29-21 27-38 1-15 32-33 12-8 37-28 29-19-21 3-35-26-26-4-39-28-25 8-38-15-33 29-30Z"
                    onClick={() => chooseContinent('América del Norte')}
                    onKeyDown={(event) => activateContinent(event, 'América del Norte')}
                    onMouseEnter={() => setHoveredContinent('América del Norte')}
                    onMouseLeave={() => setHoveredContinent(null)}
                    role="button"
                    tabIndex={0}
                    aria-label="América del Norte"
                  />
                  <path
                    className={hoveredContinent === 'América del Sur' ? 'continent hovered' : 'continent'}
                    d="m269 240 39 15 27 29-3 35 23 36-11 36-24 28-11 53-24 19-16-38-4-51-23-40 4-50-16-39 13-29Z"
                    onClick={() => chooseContinent('América del Sur')}
                    onKeyDown={(event) => activateContinent(event, 'América del Sur')}
                    onMouseEnter={() => setHoveredContinent('América del Sur')}
                    onMouseLeave={() => setHoveredContinent(null)}
                    role="button"
                    tabIndex={0}
                    aria-label="América del Sur"
                  />
                  <path
                    className={hoveredContinent === 'Europa' ? 'continent hovered' : 'continent'}
                    d="m410 113 32-25 43 8 13 27-29 18-35-4-24 14-26-12Z"
                    onClick={() => chooseContinent('Europa')}
                    onKeyDown={(event) => activateContinent(event, 'Europa')}
                    onMouseEnter={() => setHoveredContinent('Europa')}
                    onMouseLeave={() => setHoveredContinent(null)}
                    role="button"
                    tabIndex={0}
                    aria-label="Europa"
                  />
                  <path
                    className={hoveredContinent === 'África' ? 'continent hovered' : 'continent'}
                    d="m438 179 33-20 51 9 25 31 30 18 13 43-21 34-7 57-28 43-30-12-23-40-5-44-27-24-17-41-25-15Z"
                    onClick={() => chooseContinent('África')}
                    onKeyDown={(event) => activateContinent(event, 'África')}
                    onMouseEnter={() => setHoveredContinent('África')}
                    onMouseLeave={() => setHoveredContinent(null)}
                    role="button"
                    tabIndex={0}
                    aria-label="África"
                  />
                  <path
                    className={hoveredContinent === 'Asia' ? 'continent hovered' : 'continent'}
                    d="m523 116 61-35 83 13 42 28 77 13 23 37-27 25-44-16-22 21-34-9-30 31-25-9-25 25-29-19-8-32-37-18-22-29-36 2-20-15Z"
                    onClick={() => chooseContinent('Asia')}
                    onKeyDown={(event) => activateContinent(event, 'Asia')}
                    onMouseEnter={() => setHoveredContinent('Asia')}
                    onMouseLeave={() => setHoveredContinent(null)}
                    role="button"
                    tabIndex={0}
                    aria-label="Asia"
                  />
                  <path
                    className={hoveredContinent === 'Oceanía' ? 'continent hovered' : 'continent'}
                    d="m709 327 31-15 35 12 23 27-18 30-39 6-27-19-15-21Z"
                    onClick={() => chooseContinent('Oceanía')}
                    onKeyDown={(event) => activateContinent(event, 'Oceanía')}
                    onMouseEnter={() => setHoveredContinent('Oceanía')}
                    onMouseLeave={() => setHoveredContinent(null)}
                    role="button"
                    tabIndex={0}
                    aria-label="Oceanía"
                  />
                  <path className="continent tiny-island" d="m839 387 11-7 9 12-10 10-10-6Z" />
                </svg>
                {difficulty === 'easy' && hoveredContinent && (
                  <div className="map-tooltip">{hoveredContinent}</div>
                )}
                <div className="map-instruction">
                  <span>+</span>{' '}
                  {difficulty === 'easy'
                    ? 'PASÁ SOBRE UNA REGIÓN PARA EXPLORAR'
                    : 'SELECCIONÁ UNA REGIÓN'}
                </div>
                <div className="map-north">N <span>↑</span></div>
              </div>
              <div className="map-panel-footer">
                <span>
                  <i /> {difficulty === 'easy' ? 'MODO FÁCIL · NOMBRES VISIBLES' : 'MODO DIFÍCIL · NOMBRES OCULTOS'}
                </span>
                <span>PARTIDAS GENERADAS ALEATORIAMENTE CON +200 PAÍSES</span>
              </div>
            </div>
          </div>
          <p className="prototype-note">
            <span>!</span> Banderas y datos geográficos obtenidos dinámicamente vía API.
          </p>
        </section>
      )}
    </main>
  )
}

export default App
