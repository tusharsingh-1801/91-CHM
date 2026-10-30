import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {importLibrary} from '@googlemaps/js-api-loader';
import {configureMaps} from '../../lib/maps';
import type {PolygonBoundary} from './boundary';
import {usePreferences} from '../../lib/preferencesContext';

function openRing(ring:number[][]){
  const closed=ring.length>1&&ring[0][0]===ring.at(-1)?.[0]&&ring[0][1]===ring.at(-1)?.[1];
  return closed?ring.slice(0,-1):ring.slice();
}

export function FieldBoundaryEditor({boundary,onChange,boundaryFinished=false,focusLocation=null}:{boundary:PolygonBoundary|null;onChange:(value:PolygonBoundary|null)=>void;boundaryFinished?:boolean;focusLocation?:{latitude:number;longitude:number}|null}){
  const {t}=usePreferences();
  const element=useRef<HTMLDivElement>(null);
  const map=useRef<L.Map|null>(null);
  const layer=useRef<L.LayerGroup|null>(null);
  const googleMap=useRef<google.maps.Map|null>(null);
  const googlePolygon=useRef<google.maps.Polygon|null>(null);
  const googleMarkers=useRef<google.maps.Marker[]>([]);
  const [mapReady,setMapReady]=useState(false);
  const boundaryRef=useRef(boundary);
  const onChangeRef=useRef(onChange);
  const finishedRef=useRef(boundaryFinished);
  const editingRef=useRef(false);
  const configuredKey=import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const apiKey=configuredKey&&!configuredKey.startsWith('your-')?configuredKey:'';
  useLayoutEffect(()=>{boundaryRef.current=boundary;onChangeRef.current=onChange;finishedRef.current=boundaryFinished;},[boundary,onChange,boundaryFinished]);
  const addPoint=(latitude:number,longitude:number)=>{
    if(finishedRef.current)return;
    editingRef.current=true;
    const current=boundaryRef.current;
    const rings=current?.coordinates.map(openRing)??[[]];
    rings[0].push([longitude,latitude]);
    if(rings[0].length>=3)rings[0].push([...rings[0][0]]);
    onChangeRef.current({type:'Polygon',coordinates:rings});
  };
  const addCenterPoint=()=>{
    const center=googleMap.current?.getCenter();
    if(center){addPoint(center.lat(),center.lng());return;}
    const centerLeaflet=map.current?.getCenter();
    if(centerLeaflet)addPoint(centerLeaflet.lat,centerLeaflet.lng);
  };

  useEffect(()=>{
    if(!element.current)return;
    if(apiKey){
      let cancelled=false;
      let clickListener:google.maps.MapsEventListener|undefined;
      configureMaps(apiKey);
      void importLibrary('maps').then(({Map})=>{
        if(cancelled||!element.current)return;
        const instance=new Map(element.current,{center:{lat:28.6139,lng:77.2090},zoom:5,mapTypeId:'hybrid',mapTypeControl:true,streetViewControl:false,fullscreenControl:true,zoomControl:true});
        googleMap.current=instance;
        setMapReady(true);
        clickListener=instance.addListener('click',(event:google.maps.MapMouseEvent)=>{
          if(finishedRef.current||!event.latLng)return;
          if(!boundaryRef.current&&(instance.getZoom()??5)<12)instance.setZoom(14);
          addPoint(event.latLng.lat(),event.latLng.lng());
        });
      }).catch(()=>{
        if(!cancelled&&element.current){
          const instance=L.map(element.current,{scrollWheelZoom:true,zoomAnimation:false}).setView([28.6139,77.2090],5);
          map.current=instance;
          L.tileLayer(import.meta.env.VITE_OSM_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:20,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(instance);
          layer.current=L.layerGroup().addTo(instance);
          setMapReady(true);
          instance.on('click',(event:L.LeafletMouseEvent)=>{
            if(finishedRef.current)return;
            if(!boundaryRef.current&&instance.getZoom()<12)instance.setView(event.latlng,14,{animate:false});
            addPoint(event.latlng.lat,event.latlng.lng);
          });
        }
      });
      const observer=new ResizeObserver(()=>{googleMap.current?google.maps.event.trigger(googleMap.current,'resize'):map.current?.invalidateSize();});
      observer.observe(element.current);
      return()=>{cancelled=true;observer.disconnect();clickListener?.remove();googlePolygon.current?.setMap(null);googleMarkers.current.forEach(marker=>marker.setMap(null));googleMap.current=null;if(map.current){map.current.off();map.current.remove();map.current=null;layer.current=null;}};
    }
    const instance=L.map(element.current,{scrollWheelZoom:true,zoomAnimation:false}).setView([28.6139,77.2090],5);
    map.current=instance;
    L.tileLayer(import.meta.env.VITE_OSM_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxNativeZoom:19,maxZoom:20,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    const drawn=L.layerGroup().addTo(instance);layer.current=drawn;
    instance.on('click',(event:L.LeafletMouseEvent)=>{
      if(finishedRef.current)return;
      if(!boundaryRef.current&&instance.getZoom()<12)instance.setView(event.latlng,14,{animate:false});
      addPoint(event.latlng.lat,event.latlng.lng);
    });
    const observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(element.current);
    return()=>{observer.disconnect();instance.off();instance.remove();map.current=null;layer.current=null;};
  },[apiKey]);

  useEffect(()=>{
    if(!focusLocation)return;
    if(googleMap.current)googleMap.current.setCenter({lat:focusLocation.latitude,lng:focusLocation.longitude}),googleMap.current.setZoom(16);
    else map.current?.setView([focusLocation.latitude,focusLocation.longitude],16,{animate:false});
  },[focusLocation,mapReady]);

  useEffect(()=>{
    const gmap=googleMap.current;
    if(gmap){
      googlePolygon.current?.setMap(null);
      googleMarkers.current.forEach(marker=>marker.setMap(null));
      googleMarkers.current=[];
      if(!boundary||!boundary.coordinates[0]?.length)return;
      const rings=boundary.coordinates.map(ring=>openRing(ring).map(([longitude,latitude])=>({lat:latitude,lng:longitude})));
      const positions=rings[0]??[];
      if(positions.length>=3)googlePolygon.current=new google.maps.Polygon({map:gmap,paths:rings,strokeColor:'#426b24',strokeWeight:3,fillColor:'#84cc16',fillOpacity:.3});
      positions.forEach((position,index)=>{
        const marker=new google.maps.Marker({map:gmap,position,draggable:!boundaryFinished,title:`${t('Field corner','खेत का कोना')} ${index+1}`,label:{text:String(index+1),color:'#173b22',fontWeight:'700'}});
        marker.addListener('dragend',()=>{
          editingRef.current=true;
          const next=boundary.coordinates.map(ring=>ring.map(point=>[...point]));
          const moved=marker.getPosition();if(!moved)return;
          next[0][index]=[moved.lng(),moved.lat()];next[0][next[0].length-1]=[...next[0][0]];
          onChangeRef.current({type:'Polygon',coordinates:next});
        });
        googleMarkers.current.push(marker);
      });
      if(positions.length>=3&&(!editingRef.current||boundaryFinished)){const bounds=new google.maps.LatLngBounds();positions.forEach(position=>bounds.extend(position));gmap.fitBounds(bounds,48);}
      else if(positions.length)gmap.setCenter(positions[0]);
      return;
    }
    const instance=map.current;const drawn=layer.current;
    if(!instance||!drawn)return;
    drawn.clearLayers();
    if(!boundary||!boundary.coordinates[0]?.length)return;
    const positions=openRing(boundary.coordinates[0]).map(point=>L.latLng(point[1],point[0]));
    if(positions.length>=3){
      L.polygon(boundary.coordinates.map(ring=>ring.map(([longitude,latitude])=>L.latLng(latitude,longitude))),{
        color:'#cbe86b',weight:3,fillColor:'#84cc16',fillOpacity:.2,
      }).addTo(drawn);
    }
    positions.forEach((position,index)=>{
      const handle=L.marker(position,{draggable:true,icon:L.divIcon({className:'boundary-vertex',html:'',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(drawn);
      handle.on('dragend',()=>{
        editingRef.current=true;
        const next=boundary.coordinates.map(ring=>ring.map(point=>[...point]));
        const moved=handle.getLatLng();next[0][index]=[moved.lng,moved.lat];next[0][next[0].length-1]=[...next[0][0]];
        onChangeRef.current({type:'Polygon',coordinates:next});
      });
    });
    if(positions.length>=3&&(!editingRef.current||boundaryFinished)){const bounds=L.latLngBounds(positions);if(bounds.isValid())instance.fitBounds(bounds.pad(.25),{maxZoom:18,animate:false});}
    else if(positions.length)instance.setView(positions[0],14,{animate:false});
  },[boundary,boundaryFinished,t,mapReady]);

  return <div className="boundary-map-wrap">
    <div ref={element} className="boundary-map" aria-label={t('Draw or edit field boundary on satellite map', 'उपग्रह नक्शे पर खेत की सीमा बनाएँ या बदलें')}/>
    <span className="boundary-map-crosshair" aria-hidden="true">+</span>
    <button className="boundary-map-add-center" type="button" onClick={addCenterPoint} disabled={boundaryFinished}>{t('Add corner at crosshair','बीच के निशान पर कोना जोड़ें')}</button>
  </div>;
}
