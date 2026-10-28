export type Continent = 'América del Norte' | 'América del Sur' | 'Europa' | 'África' | 'Asia' | 'Oceanía'

export interface CountryChallenge {
  id: string
  country: string
  continent: Continent
  capital: string
  flagUrl: string
  code: string
  numericCode: string
  alpha3?: string
  borders?: string[]
  coordinates?: [number, number]
  isSovereign?: boolean
  population?: number
}

interface RawCountry {
  name: { common: string }
  translations?: { spa?: { common?: string } }
  region?: string
  subregion?: string
  independent?: boolean
  capital?: string[]
  cca2?: string
  cca3?: string
  ccn3?: string
  borders?: string[]
  latlng?: number[]
  population?: number
}

const FALLBACK_CHALLENGES: CountryChallenge[] = [
  { id: 'jp', country: 'Japón', continent: 'Asia', capital: 'Tokio', flagUrl: 'https://flagcdn.com/w640/jp.png', code: 'JP', numericCode: '392', isSovereign: true, population: 125800000 },
  { id: 'br', country: 'Brasil', continent: 'América del Sur', capital: 'Brasilia', flagUrl: 'https://flagcdn.com/w640/br.png', code: 'BR', numericCode: '076', isSovereign: true, population: 214300000 },
  { id: 'eg', country: 'Egipto', continent: 'África', capital: 'El Cairo', flagUrl: 'https://flagcdn.com/w640/eg.png', code: 'EG', numericCode: '818', isSovereign: true, population: 109300000 },
  { id: 'fr', country: 'Francia', continent: 'Europa', capital: 'París', flagUrl: 'https://flagcdn.com/w640/fr.png', code: 'FR', numericCode: '250', isSovereign: true, population: 67750000 },
  { id: 'ca', country: 'Canadá', continent: 'América del Norte', capital: 'Ottawa', flagUrl: 'https://flagcdn.com/w640/ca.png', code: 'CA', numericCode: '124', isSovereign: true, population: 38250000 },
  { id: 'au', country: 'Australia', continent: 'Oceanía', capital: 'Canberra', flagUrl: 'https://flagcdn.com/w640/au.png', code: 'AU', numericCode: '036', isSovereign: true, population: 25690000 },
  { id: 'ar', country: 'Argentina', continent: 'América del Sur', capital: 'Buenos Aires', flagUrl: 'https://flagcdn.com/w640/ar.png', code: 'AR', numericCode: '032', isSovereign: true, population: 45810000 },
  { id: 'mx', country: 'México', continent: 'América del Norte', capital: 'Ciudad de México', flagUrl: 'https://flagcdn.com/w640/mx.png', code: 'MX', numericCode: '484', isSovereign: true, population: 126700000 },
  { id: 'ke', country: 'Kenia', continent: 'África', capital: 'Nairobi', flagUrl: 'https://flagcdn.com/w640/ke.png', code: 'KE', numericCode: '404', isSovereign: true, population: 53010000 },
  { id: 'kr', country: 'Corea del Sur', continent: 'Asia', capital: 'Seúl', flagUrl: 'https://flagcdn.com/w640/kr.png', code: 'KR', numericCode: '410', isSovereign: true, population: 51740000 },
  { id: 'es', country: 'España', continent: 'Europa', capital: 'Madrid', flagUrl: 'https://flagcdn.com/w640/es.png', code: 'ES', numericCode: '724', isSovereign: true, population: 47420000 },
  { id: 'nz', country: 'Nueva Zelanda', continent: 'Oceanía', capital: 'Wellington', flagUrl: 'https://flagcdn.com/w640/nz.png', code: 'NZ', numericCode: '554', isSovereign: true, population: 5123000 },
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
      const numericCode = item.ccn3?.padStart(3, '0')

      if (continent && cca2 && countryName && numericCode) {
        parsed.push({
          id: cca2,
          country: countryName,
          continent,
          capital: item.capital?.[0] || 'No especificada',
          flagUrl: `https://flagcdn.com/w640/${cca2}.png`,
          code: item.cca2?.toUpperCase() || '',
          numericCode,
          alpha3: item.cca3,
          borders: item.borders,
          coordinates: item.latlng?.length === 2 ? [item.latlng[0], item.latlng[1]] : undefined,
          isSovereign: Boolean(item.independent || item.cca2 === 'PS'),
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
  const all = (await fetchAllCountries()).filter((country) => country.isSovereign)
  
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
