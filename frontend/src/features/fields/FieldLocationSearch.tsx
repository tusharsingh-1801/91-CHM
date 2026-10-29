import {useEffect,useRef,useState} from 'react';
import {usePreferences} from '../../lib/preferencesContext';
import {configureMaps} from '../../lib/maps';
import {importLibrary} from '@googlemaps/js-api-loader';

export function FieldLocationSearch({onSelect}:{onSelect:(location:{latitude:number;longitude:number;address:string})=>void}){
 const {t}=usePreferences();
 const host=useRef<HTMLDivElement>(null);
 const onSelectRef=useRef(onSelect);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const configuredKey=import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
 const apiKey=configuredKey&&!configuredKey.startsWith('your-')?configuredKey:'';
 useEffect(()=>{onSelectRef.current=onSelect;},[onSelect]);
 useEffect(()=>{
  if(!apiKey||!host.current)return;
  let cancelled=false;
  let autocomplete:google.maps.places.PlaceAutocompleteElement|undefined;
  const handleSelect=async(event:Event)=>{
   const prediction=(event as google.maps.places.PlacePredictionSelectEvent).placePrediction;
   setBusy(true);setError('');setMessage('');
   try{
    const place=prediction.toPlace();
    await place.fetchFields({fields:['location','formattedAddress']});
    const point=place.location?.toJSON();
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))throw new Error('No coordinates were returned for that place.');
    let address=place.formattedAddress??'';
    try{
     const geocoding=await importLibrary('geocoding');
     const result=await new geocoding.Geocoder().geocode({location:point});
     address=result.results[0]?.formatted_address||address;
    }catch{/* Places still provides the selected point if reverse geocoding is unavailable. */}
    onSelectRef.current({latitude:point.lat,longitude:point.lng,address});
    setMessage(address||t('Location selected. Mark the field corners on the map.','स्थान चुन लिया। नक्शे पर खेत के कोने बनाएँ।'));
   }catch(caught){setError(caught instanceof Error?caught.message:t('Could not find that location. Try another search.','यह जगह नहीं मिली। दूसरी जगह खोजें।'));}
   finally{setBusy(false);}
  };
  configureMaps(apiKey);
  void importLibrary('places').then(places=>{
   if(cancelled||!host.current)return;
   autocomplete=new places.PlaceAutocompleteElement({placeholder:t('Search village, town or nearby landmark','गाँव, कस्बा या पास की जगह खोजें'),description:t('Choose a nearby location, then mark the exact field boundary','पास की जगह चुनें, फिर खेत की सही सीमा बनाएँ')});
   autocomplete.style.width='100%';
   autocomplete.addEventListener('gmp-select',handleSelect);
   host.current.replaceChildren(autocomplete);
  }).catch(()=>{if(!cancelled)setError(t('Google Places could not load. You can still mark the field manually.','Google Places नहीं खुला। आप नक्शे पर हाथ से खेत बना सकते हैं।'));});
  return()=>{cancelled=true;autocomplete?.removeEventListener('gmp-select',handleSelect);host.current?.replaceChildren();};
 },[apiKey,t]);
 if(!apiKey)return <p className="field-location-search-note">{t('Add a Google Maps browser key to enable place search; manual boundary drawing remains available.','जगह खोजने के लिए Google Maps browser key जोड़ें। हाथ से खेत की सीमा बनाना उपलब्ध है।')}</p>;
 return <div className="field-location-search"><label>{t('Find the farm area','खेत का इलाका खोजें')}</label><div ref={host}/>{busy&&<small role="status">{t('Looking up location…','जगह की जानकारी ला रहे हैं…')}</small>}{message&&!busy&&<small role="status">{message}</small>}{error&&<small role="alert">{error}</small>}</div>;
}
