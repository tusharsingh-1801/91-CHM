import { useEffect, useRef } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

type Props = { latitude: number; longitude: number; fieldName?: string; zoom?: number; stressGeojson?: Record<string, unknown> | null; overlay?: { image: string, bounds: any } | null; tileUrl?: string | null }

export function GoogleSatelliteMap({ latitude, longitude, fieldName = '', zoom = 14, stressGeojson, overlay, tileUrl }: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const overlayRef = useRef<google.maps.GroundOverlay | null>(null)
  const tileOverlayRef = useRef<google.maps.ImageMapType | null>(null)
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
      
      // Setup styling for data layer
      mapRef.current.data.setStyle({
        fillColor: '#ef4444', // Red for stress
        strokeColor: '#b91c1c',
        strokeWeight: 2,
        fillOpacity: 0.6
      });
    }).catch(() => undefined)
    return () => { if (markerRef.current) markerRef.current.map = null; mapRef.current = null }
  }, [apiKey, fieldName, latitude, longitude, mapId, zoom])

  useEffect(() => {
    if (mapRef.current) {
      // Clear previous
      mapRef.current.data.forEach((feature) => mapRef.current!.data.remove(feature));
      if (stressGeojson) {
        mapRef.current.data.addGeoJson({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: stressGeojson as never, properties: {} }]
        });
      }
    }
  }, [stressGeojson]);

  useEffect(() => { if (mapRef.current) mapRef.current.setZoom(zoom + 14) }, [zoom])
  
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
  }, [overlay]);

  
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
  }, [tileUrl]);

  return <div ref={mapElement} className="google-map" aria-label={`Google satellite view of ${fieldName}`} />
}
