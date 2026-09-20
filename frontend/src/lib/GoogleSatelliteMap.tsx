import { useEffect, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

type Props = { latitude: number; longitude: number; fieldName?: string; zoom?: number; stressGeojson?: Record<string, unknown> | null; boundaryGeojson?: Record<string, unknown> | null; overlay?: { image: string, bounds: any } | null; tileUrl?: string | null }

export function GoogleSatelliteMap({ latitude, longitude, fieldName = '', zoom = 14, stressGeojson, boundaryGeojson, overlay, tileUrl }: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const overlayRef = useRef<google.maps.GroundOverlay | null>(null)
  const tileOverlayRef = useRef<google.maps.ImageMapType | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID

  useEffect(() => {
    if (!apiKey || !mapElement.current) return
    let cancelled = false
    setOptions({ key: apiKey, v: 'weekly' })
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
    }).catch(() => undefined)
    return () => { cancelled = true; setMapReady(false); if (markerRef.current) markerRef.current.map = null; mapRef.current = null }
  }, [apiKey, fieldName, latitude, longitude, mapId, zoom])

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
      overlayRef.current = new google.maps.GroundOverlay(overlay.image, overlay.bounds, { opacity: 0.8 });
      overlayRef.current.setMap(mapRef.current);
    } else if (!overlay && overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }
  }, [mapReady, overlay]);

  
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
        opacity: 0.8,
        name: 'NDVI'
      });
      tileOverlayRef.current = imageMapType;
      mapRef.current.overlayMapTypes.push(imageMapType);
    } else {
      mapRef.current.overlayMapTypes.clear();
      tileOverlayRef.current = null;
    }
  }, [mapReady, tileUrl]);

  if (!apiKey) return <div className="map-unavailable" role="alert">Google Maps is not configured. Add a browser-restricted VITE_GOOGLE_MAPS_API_KEY to display the map.</div>
  return <div ref={mapElement} className="google-map" aria-label={`Satellite map of ${fieldName}`} />
}
