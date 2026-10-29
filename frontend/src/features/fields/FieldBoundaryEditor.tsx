import {useEffect,useLayoutEffect,useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
  const boundaryRef=useRef(boundary);
  const onChangeRef=useRef(onChange);
  const finishedRef=useRef(boundaryFinished);
  const editingRef=useRef(false);
  useLayoutEffect(()=>{boundaryRef.current=boundary;onChangeRef.current=onChange;finishedRef.current=boundaryFinished;},[boundary,onChange,boundaryFinished]);

  useEffect(()=>{
    if(!element.current)return;
    const instance=L.map(element.current,{scrollWheelZoom:true,zoomAnimation:false}).setView([28.6139,77.2090],5);
    map.current=instance;
    L.tileLayer(import.meta.env.VITE_OSM_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxNativeZoom:19,maxZoom:20,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    const drawn=L.layerGroup().addTo(instance);layer.current=drawn;
    instance.on('click',(event:L.LeafletMouseEvent)=>{
      if(finishedRef.current)return;
      editingRef.current=true;
      const current=boundaryRef.current;
      if(!current&&instance.getZoom()<12)instance.setView(event.latlng,14,{animate:false});
      const rings=current?.coordinates.map(openRing)??[[]];
      rings[0].push([event.latlng.lng,event.latlng.lat]);
      if(rings[0].length>=3)rings[0].push([...rings[0][0]]);
      onChangeRef.current({type:'Polygon',coordinates:rings});
    });
    const observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(element.current);
    return()=>{observer.disconnect();instance.off();instance.remove();map.current=null;layer.current=null;};
  },[]);

  useEffect(()=>{
    if(!focusLocation||!map.current)return;
    map.current.setView([focusLocation.latitude,focusLocation.longitude],14,{animate:false});
  },[focusLocation]);

  useEffect(()=>{
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
  },[boundary,boundaryFinished]);

  return <div ref={element} className="boundary-map" aria-label={t('Draw or edit field boundary on OpenStreetMap', 'OpenStreetMap पर खेत की सीमा बनाएँ या बदलें')}/>;
}
