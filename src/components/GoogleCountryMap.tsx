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
  onCountryClick: (numericCode: string) => void
}

function getNumericCode(feature: google.maps.Data.Feature) {
  const featureId = feature.getId()
  return featureId === undefined ? '' : String(featureId).padStart(3, '0')
}

function getCountryName(feature: google.maps.Data.Feature) {
  const name = feature.getProperty('ADMIN') ?? feature.getProperty('name') ?? feature.getProperty('NAME')
  return typeof name === 'string' ? name : ''
}

export function GoogleCountryMap({
  targetCountryNumericCode,
  selectedNumericCode,
  isCorrect,
  showCountryNames,
  onCountryClick,
}: GoogleCountryMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const clickHandlerRef = useRef(onCountryClick)
  const showCountryNamesRef = useRef(showCountryNames)
  const [mapError, setMapError] = useState<string | null>(null)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    clickHandlerRef.current = onCountryClick
    showCountryNamesRef.current = showCountryNames
  }, [onCountryClick, showCountryNames])

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
          styles: [
            { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#52646a' }] },
            { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#d6e6d9' }] },
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'road', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#a9cfcb' }] },
          ],
        })
        setMapInstance(map)

        const response = await fetch(countriesTopoJsonUrl)
        if (!response.ok) throw new Error(`Error cargando límites de países: ${response.status}`)
        const topology = (await response.json()) as Topology
        if (isCancelled) return

        const geoJson = topojsonFeature(topology, topology.objects.countries)
        const features = map.data.addGeoJson(geoJson)
        if (!features.some((feature) => getNumericCode(feature))) {
          throw new Error('El mapa no contiene códigos numéricos de países compatibles.')
        }

        const infoWindow = new google.maps.InfoWindow()
        clickListener = map.data.addListener('click', (event: google.maps.Data.MouseEvent) => {
          const numericCode = getNumericCode(event.feature)
          if (numericCode) clickHandlerRef.current(numericCode)
        })
        mouseoverListener = map.data.addListener('mouseover', (event: google.maps.Data.MouseEvent) => {
          map.data.overrideStyle(event.feature, { fillColor: '#d2d978', fillOpacity: 0.9 })
          if (showCountryNamesRef.current) {
            const countryName = getCountryName(event.feature)
            if (countryName && event.latLng) {
              const label = document.createElement('span')
              label.textContent = countryName
              infoWindow.setContent(label)
              infoWindow.setPosition(event.latLng)
              infoWindow.open({ map })
            }
          }
        })
        mouseoutListener = map.data.addListener('mouseout', (event: google.maps.Data.MouseEvent) => {
          map.data.revertStyle(event.feature)
          infoWindow.close()
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
    mapInstance?.data.setStyle((feature) => {
      const numericCode = getNumericCode(feature)
          const isTarget = numericCode === targetCountryNumericCode
      const isSelectedWrongCountry = numericCode === selectedNumericCode && !isCorrect

      return {
        clickable: Boolean(numericCode),
        fillColor: isTarget && isCorrect ? '#d9ed78' : isSelectedWrongCountry ? '#ff6655' : '#668f76',
        fillOpacity: isTarget && isCorrect ? 0.9 : isSelectedWrongCountry ? 0.85 : 0.68,
        strokeColor: '#405f57',
        strokeWeight: 0.7,
        zIndex: isTarget || isSelectedWrongCountry ? 2 : 1,
      }
    })
  }, [isCorrect, mapInstance, selectedNumericCode, targetCountryNumericCode])

  const visibleMapError = mapError ?? (!apiKey ? 'Configurá VITE_GOOGLE_MAPS_API_KEY para cargar Google Maps.' : null)

  return (
    <div className="google-map-wrap">
      <div className="google-map-canvas" ref={mapElementRef} aria-label="Mapa mundial interactivo por países" />
      {visibleMapError && <div className="map-status" role="status">{visibleMapError}</div>}
    </div>
  )
}