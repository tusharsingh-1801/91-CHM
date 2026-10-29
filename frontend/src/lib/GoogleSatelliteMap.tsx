import { useEffect, useRef, useState } from 'react'
import { configureMaps } from './maps';
import { importLibrary } from '@googlemaps/js-api-loader'

import { OpenFieldMap } from './OpenFieldMap';
import type { FieldMapProps } from './mapTypes';

export function GoogleSatelliteMap({ latitude, longitude, fieldName = '', zoom = 14, stressGeojson, boundaryGeojson, overlay, tileUrl, opacity = .8 }: FieldMapProps) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const overlayRef = useRef<google.maps.GroundOverlay | null>(null)
  const tileOverlayRef = useRef<google.maps.ImageMapType | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const configuredKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const apiKey = configuredKey && !configuredKey.startsWith('your-') ? configuredKey : ''
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID

  useEffect(() => {
    if (!apiKey || !mapElement.current) return
    let cancelled = false
    setMapError('')
    configureMaps(apiKey)
    Promise.all([importLibrary('maps'), importLibrary('marker')]).then(([mapsLibrary, markerLibrary]) => {
      if (cancelled || !mapElement.current) return
      const position = { lat: latitude, lng: longitude }
      const Map = mapsLibrary.Map
      const AdvancedMarkerElement = markerLibrary.AdvancedMarkerElement
      mapRef.current = new Map(mapElement.current, { center: position, zoom, mapId, mapTypeId: 'satellite', mapTypeControl: true, streetViewControl: false, fullscreenControl: true, zoomControl: true })
      markerRef.current = new AdvancedMarkerElement({ position, map: mapRef.current, title: fieldName })
      
      // Setup styling for data layer
      mapRef.current.data.setStyle((feature) => {
        const isStress = feature.getProperty('kind') === 'stress';
        return {
          fillColor: isStress ? '#ef4444' : '#84cc16',
          strokeColor: isStress ? '#b91c1c' : '#4d7c0f',
          strokeWeight: isStress ? 2 : 3,
          fillOpacity: isStress ? 0.6 : 0.08,
        };
      });
      setMapReady(true)
    }).catch(() => { if (!cancelled) setMapError('Google Maps could not be loaded. Verify the API key, billing and localhost restriction.') })
    return () => { cancelled = true; setMapReady(false); if (markerRef.current) markerRef.current.map = null; mapRef.current = null }
  }, [apiKey, attempt, fieldName, latitude, longitude, mapId, zoom])

  useEffect(() => {
    if (mapRef.current) {
      // Clear previous
      mapRef.current.data.forEach((feature) => mapRef.current!.data.remove(feature));
      if (boundaryGeojson) {
        const features = mapRef.current.data.addGeoJson({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: boundaryGeojson as never, properties: {} }]
        });
        features.forEach(feature => feature.setProperty('kind', 'boundary'));
      }
      if (stressGeojson) {
        const features = mapRef.current.data.addGeoJson({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: stressGeojson as never, properties: {} }]
        });
        features.forEach(feature => feature.setProperty('kind', 'stress'));
      }
    }
  }, [boundaryGeojson, mapReady, stressGeojson]);

  useEffect(() => { if (mapRef.current) mapRef.current.setZoom(zoom) }, [mapReady, zoom])
  
  useEffect(() => {
    if (!mapRef.current) return;
    if (overlay && overlay.image && overlay.bounds) {
      if (overlayRef.current) overlayRef.current.setMap(null);
      overlayRef.current = new google.maps.GroundOverlay(overlay.image, overlay.bounds, { opacity });
      overlayRef.current.setMap(mapRef.current);
    } else if (!overlay && overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }
  }, [mapReady, overlay, opacity]);

  
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileUrl) {
      if (tileOverlayRef.current) {
        mapRef.current.overlayMapTypes.clear();
      }
      const imageMapType = new google.maps.ImageMapType({
        getTileUrl: function(coord, zoom) {
          return tileUrl.replace('{z}', zoom.toString()).replace('{x}', coord.x.toString()).replace('{y}', coord.y.toString());
        },
        tileSize: new google.maps.Size(256, 256),
        maxZoom: 20,
        minZoom: 0,
        opacity,
        name: 'NDVI'
      });
      tileOverlayRef.current = imageMapType;
      mapRef.current.overlayMapTypes.push(imageMapType);
    } else {
      mapRef.current.overlayMapTypes.clear();
      tileOverlayRef.current = null;
    }
  }, [mapReady, tileUrl, opacity]);

  if (!apiKey) return <OpenFieldMap latitude={latitude} longitude={longitude} fieldName={fieldName} zoom={zoom} boundaryGeojson={boundaryGeojson} stressGeojson={stressGeojson} tileUrl={tileUrl} overlay={overlay} opacity={opacity} />
  if (mapError) return <div><OpenFieldMap latitude={latitude} longitude={longitude} fieldName={fieldName} zoom={zoom} boundaryGeojson={boundaryGeojson} stressGeojson={stressGeojson} tileUrl={tileUrl} overlay={overlay} opacity={opacity}/><div className="map-load-error" role="status">{mapError} OpenStreetMap is shown instead. <button type="button" onClick={() => { setMapError(''); setAttempt(value => value + 1) }}>Retry Google map</button></div></div>
  return <div ref={mapElement} className="google-map" aria-label={`Satellite map of ${fieldName}`} />
}
