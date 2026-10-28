import { useEffect, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { feature as topojsonFeature } from 'topojson-client'
import type { Topology } from 'topojson-specification'

const countriesTopoJsonUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'
let mapsApiConfigured = false

interface GoogleCountryMapProps {
  targetCountryNumericCode: string
  selectedNumericCode: string | null
  isCorrect: boolean
  showCountryNames: boolean
  guessedCountryNumericCodes: string[]
  showGuessedCountries: boolean
  onCountryClick: (numericCode: string) => void
}

function getNumericCode(feature: google.maps.Data.Feature) {
  const featureId = feature.getId()
  return featureId === undefined ? '' : String(featureId).padStart(3, '0')
}

function getMapStyles(showCountryNames: boolean): google.maps.MapTypeStyle[] {
  return [
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#52646a' }] },
    { featureType: 'all', elementType: 'labels', stylers: [{ visibility: showCountryNames ? 'on' : 'off' }] },
    { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#d6e6d9' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#a9cfcb' }] },
  ]
}

export function GoogleCountryMap({
  targetCountryNumericCode,
  selectedNumericCode,
  isCorrect,
  showCountryNames,
  guessedCountryNumericCodes,
  showGuessedCountries,
  onCountryClick,
}: GoogleCountryMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const clickHandlerRef = useRef(onCountryClick)
  const showCountryNamesRef = useRef(showCountryNames)
  const showGuessedCountriesRef = useRef(showGuessedCountries)
  const isCorrectRef = useRef(isCorrect)
  const guessedCountryNumericCodesRef = useRef(guessedCountryNumericCodes)
  const [mapError, setMapError] = useState<string | null>(null)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    clickHandlerRef.current = onCountryClick
    showCountryNamesRef.current = showCountryNames
    showGuessedCountriesRef.current = showGuessedCountries
    isCorrectRef.current = isCorrect
    guessedCountryNumericCodesRef.current = guessedCountryNumericCodes
  }, [guessedCountryNumericCodes, isCorrect, onCountryClick, showCountryNames, showGuessedCountries])

  useEffect(() => {
    if (!apiKey) return

    let isCancelled = false
    let clickListener: google.maps.MapsEventListener | undefined
    let mouseoverListener: google.maps.MapsEventListener | undefined
    let mouseoutListener: google.maps.MapsEventListener | undefined

    async function initializeMap() {
      try {
        if (!mapsApiConfigured) {
          setOptions({ key: apiKey, v: 'weekly' })
          mapsApiConfigured = true
        }
        const { Map } = await importLibrary('maps')
        if (isCancelled || !mapElementRef.current) return

        const map = new Map(mapElementRef.current, {
          center: { lat: 18, lng: 8 },
          zoom: 2,
          minZoom: 2,
          maxZoom: 7,
          mapTypeId: 'roadmap',
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          styles: getMapStyles(showCountryNamesRef.current),
        })
        setMapInstance(map)

        const response = await fetch(countriesTopoJsonUrl)
        if (!response.ok) throw new Error(`Error cargando límites de países: ${response.status}`)
        const topology = (await response.json()) as Topology
        if (isCancelled) return

        const geoJson = topojsonFeature(topology, topology.objects.countries)
        const features = map.data.addGeoJson(geoJson)
        map.data.addGeoJson({
          type: 'Feature',
          id: '798',
          properties: {},
          geometry: { type: 'Point', coordinates: [177.156, -8.52] },
        })
        if (!features.some((feature) => getNumericCode(feature))) {
          throw new Error('El mapa no contiene códigos numéricos de países compatibles.')
        }

        clickListener = map.data.addListener('click', (event: google.maps.Data.MouseEvent) => {
          const numericCode = getNumericCode(event.feature)
          if (numericCode) clickHandlerRef.current(numericCode)
        })
        mouseoverListener = map.data.addListener('mouseover', (event: google.maps.Data.MouseEvent) => {
          const numericCode = getNumericCode(event.feature)
          if (
            isCorrectRef.current
            || (showGuessedCountriesRef.current && guessedCountryNumericCodesRef.current.includes(numericCode))
          ) return
          if (numericCode === '798') return
          map.data.overrideStyle(event.feature, { fillColor: '#d2d978', fillOpacity: 0.9 })
        })
        mouseoutListener = map.data.addListener('mouseout', (event: google.maps.Data.MouseEvent) => {
          map.data.revertStyle(event.feature)
        })
      } catch (error) {
        console.error('No se pudo inicializar Google Maps:', error)
        if (!isCancelled) {
          setMapError('No se pudo cargar Google Maps. Revisá la clave, la facturación y las restricciones de la API.')
        }
      }
    }

    void initializeMap()
    return () => {
      isCancelled = true
      clickListener?.remove()
      mouseoverListener?.remove()
      mouseoutListener?.remove()
    }
  }, [apiKey])

  useEffect(() => {
    mapInstance?.setOptions({ styles: getMapStyles(showCountryNames) })
  }, [mapInstance, showCountryNames])

  useEffect(() => {
    mapInstance?.data.setStyle((feature) => {
      const numericCode = getNumericCode(feature)
      const isTarget = numericCode === targetCountryNumericCode
      const isSelectedWrongCountry = numericCode === selectedNumericCode && !isCorrect
      const isGuessed = guessedCountryNumericCodes.includes(numericCode)
      const isColoredGuessed = isGuessed && showGuessedCountries
      const isTuvalu = numericCode === '798'
      const fillColor = isColoredGuessed
        ? '#285a3b'
        : isTarget && isCorrect
          ? '#d9ed78'
          : isSelectedWrongCountry
            ? '#ff6655'
            : '#668f76'
      const fillOpacity = isColoredGuessed || (isTarget && isCorrect)
        ? 0.95
        : isSelectedWrongCountry
          ? 0.85
          : 0.68

      return {
        clickable: Boolean(numericCode) && !isCorrect && !isGuessed,
        fillColor,
        fillOpacity,
        strokeColor: '#405f57',
        strokeWeight: 0.7,
        ...(isTuvalu && {
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor,
            fillOpacity,
            scale: 8,
            strokeColor: '#405f57',
            strokeWeight: 1.5,
          },
        }),
        zIndex: isGuessed || isTarget || isSelectedWrongCountry ? 2 : 1,
      }
    })
  }, [guessedCountryNumericCodes, isCorrect, mapInstance, selectedNumericCode, showGuessedCountries, targetCountryNumericCode])

  const visibleMapError = mapError ?? (!apiKey ? 'Configurá VITE_GOOGLE_MAPS_API_KEY para cargar Google Maps.' : null)

  return (
    <div className="google-map-wrap">
      <div className="google-map-canvas" ref={mapElementRef} aria-label="Mapa mundial interactivo por países" />
      {visibleMapError && <div className="map-status" role="status">{visibleMapError}</div>}
    </div>
  )
}