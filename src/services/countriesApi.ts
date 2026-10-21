export type Continent = 'América del Norte' | 'América del Sur' | 'Europa' | 'África' | 'Asia' | 'Oceanía'

export interface CountryChallenge {
  id: string
  country: string
  continent: Continent
  capital: string
  flagUrl: string
  code: string
  population?: number
}

interface RawCountry {
  name: { common: string }
  translations?: { spa?: { common?: string } }
  region?: string
  subregion?: string
  capital?: string[]
  cca2?: string
  population?: number
}

const FALLBACK_CHALLENGES: CountryChallenge[] = [
  { id: 'jp', country: 'Japón', continent: 'Asia', capital: 'Tokio', flagUrl: 'https://flagcdn.com/w640/jp.png', code: 'JP', population: 125800000 },
  { id: 'br', country: 'Brasil', continent: 'América del Sur', capital: 'Brasilia', flagUrl: 'https://flagcdn.com/w640/br.png', code: 'BR', population: 214300000 },
  { id: 'eg', country: 'Egipto', continent: 'África', capital: 'El Cairo', flagUrl: 'https://flagcdn.com/w640/eg.png', code: 'EG', population: 109300000 },
  { id: 'fr', country: 'Francia', continent: 'Europa', capital: 'París', flagUrl: 'https://flagcdn.com/w640/fr.png', code: 'FR', population: 67750000 },
  { id: 'ca', country: 'Canadá', continent: 'América del Norte', capital: 'Ottawa', flagUrl: 'https://flagcdn.com/w640/ca.png', code: 'CA', population: 38250000 },
  { id: 'au', country: 'Australia', continent: 'Oceanía', capital: 'Canberra', flagUrl: 'https://flagcdn.com/w640/au.png', code: 'AU', population: 25690000 },
  { id: 'ar', country: 'Argentina', continent: 'América del Sur', capital: 'Buenos Aires', flagUrl: 'https://flagcdn.com/w640/ar.png', code: 'AR', population: 45810000 },
  { id: 'mx', country: 'México', continent: 'América del Norte', capital: 'Ciudad de México', flagUrl: 'https://flagcdn.com/w640/mx.png', code: 'MX', population: 126700000 },
  { id: 'ke', country: 'Kenia', continent: 'África', capital: 'Nairobi', flagUrl: 'https://flagcdn.com/w640/ke.png', code: 'KE', population: 53010000 },
  { id: 'kr', country: 'Corea del Sur', continent: 'Asia', capital: 'Seúl', flagUrl: 'https://flagcdn.com/w640/kr.png', code: 'KR', population: 51740000 },
  { id: 'es', country: 'España', continent: 'Europa', capital: 'Madrid', flagUrl: 'https://flagcdn.com/w640/es.png', code: 'ES', population: 47420000 },
  { id: 'nz', country: 'Nueva Zelanda', continent: 'Oceanía', capital: 'Wellington', flagUrl: 'https://flagcdn.com/w640/nz.png', code: 'NZ', population: 5123000 },
]

let cachedCountries: CountryChallenge[] | null = null

function mapToContinent(region?: string, subregion?: string): Continent | null {
  if (region === 'Africa') return 'África'
  if (region === 'Asia') return 'Asia'
  if (region === 'Europe') return 'Europa'
  if (region === 'Oceania') return 'Oceanía'
  if (region === 'Americas') {
    return subregion === 'South America' ? 'América del Sur' : 'América del Norte'
  }
  return null
}

export async function fetchAllCountries(): Promise<CountryChallenge[]> {
  if (cachedCountries && cachedCountries.length > 0) {
    return cachedCountries
  }

  try {
    const response = await fetch('https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json', {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`)
    }

    const rawData: RawCountry[] = await response.json()

    const parsed: CountryChallenge[] = []
    for (const item of rawData) {
      const continent = mapToContinent(item.region, item.subregion)
      const cca2 = item.cca2?.toLowerCase()
      const countryName = item.translations?.spa?.common || item.name?.common

      if (continent && cca2 && countryName) {
        parsed.push({
          id: cca2,
          country: countryName,
          continent,
          capital: item.capital?.[0] || 'No especificada',
          flagUrl: `https://flagcdn.com/w640/${cca2}.png`,
          code: item.cca2?.toUpperCase() || '',
          population: item.population,
        })
      }
    }

    if (parsed.length > 0) {
      cachedCountries = parsed
      return parsed
    }
    throw new Error('La respuesta de la API no contiene países válidos')
  } catch (error) {
    console.warn('No se pudo obtener la lista de países desde la API, usando datos de respaldo:', error)
    cachedCountries = FALLBACK_CHALLENGES
    return FALLBACK_CHALLENGES
  }
}

export async function getRandomChallenges(count: number = 5): Promise<CountryChallenge[]> {
  const all = await fetchAllCountries()
  
  // Mezclar aleatoriamente asegurando variedad
  const shuffled = [...all].sort(() => 0.5 - Math.random())
  
  // Intentar asegurar que haya diversidad de continentes en la partida
  const selected: CountryChallenge[] = []
  const usedContinents = new Set<Continent>()
  
  for (const item of shuffled) {
    if (!usedContinents.has(item.continent) && selected.length < count) {
      selected.push(item)
      usedContinents.add(item.continent)
    }
  }

  // Rellenar hasta 'count' si faltan
  for (const item of shuffled) {
    if (selected.length >= count) break
    if (!selected.some(s => s.id === item.id)) {
      selected.push(item)
    }
  }

  return selected
}
