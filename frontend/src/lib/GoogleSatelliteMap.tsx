import { useEffect, useRef } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

type Props = { latitude: number; longitude: number; fieldName: string; zoom: number }

export function GoogleSatelliteMap({ latitude, longitude, fieldName, zoom }: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID

  useEffect(() => {
    if (!apiKey || !mapElement.current) return
    setOptions({ key: apiKey, v: 'weekly' })
    Promise.all([importLibrary('maps'), importLibrary('marker')]).then(([mapsLibrary, markerLibrary]) => {
      if (!mapElement.current) return
      const position = { lat: latitude, lng: longitude }
      const Map = mapsLibrary.Map
      const AdvancedMarkerElement = markerLibrary.AdvancedMarkerElement
      mapRef.current = new Map(mapElement.current, { center: position, zoom: zoom + 14, mapId, mapTypeId: 'satellite', mapTypeControl: false, streetViewControl: false, fullscreenControl: false, zoomControl: false })
      markerRef.current = new AdvancedMarkerElement({ position, map: mapRef.current, title: fieldName })
    }).catch(() => undefined)
    return () => { if (markerRef.current) markerRef.current.map = null; mapRef.current = null }
  }, [apiKey, fieldName, latitude, longitude, mapId, zoom])

  useEffect(() => { if (mapRef.current) mapRef.current.setZoom(zoom + 14) }, [zoom])
  return <div ref={mapElement} className="google-map" aria-label={`Google satellite view of ${fieldName}`} />
}
