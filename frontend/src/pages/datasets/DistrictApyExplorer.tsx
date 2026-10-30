import {useEffect,useState,type ChangeEvent} from 'react';
import {usePreferences} from '../../lib/preferencesContext';

type Filters={states:string[];districts:string[];crops:string[];years:string[];sources:{source_id:string;row_count:string;latest_year:string}[]};
type Item={source_id:string;crop_year:string;state_name:string;district_name:string;season:string|null;crop_name:string;area_value:number|string|null;area_unit:string|null;production_value:number|string|null;production_unit:string|null;yield_value:number|string|null;yield_unit:string|null};
type Page={items:Item[];hasMore:boolean;offset:number;limit:number};

export function DistrictApyExplorer(){
 const {t}=usePreferences();
 const [stateName,setStateName]=useState('Uttar Pradesh'),[district,setDistrict]=useState(''),[crop,setCrop]=useState(''),[source,setSource]=useState('upag');
 const [yearFrom,setYearFrom]=useState('2024-2025'),[yearTo,setYearTo]=useState('2024-2025'),[offset,setOffset]=useState(0);
 const [filters,setFilters]=useState<Filters>({states:[],districts:[],crops:[],years:[],sources:[]});
 const [page,setPage]=useState<Page>({items:[],hasMore:false,offset:0,limit:100});
 const [loading,setLoading]=useState(true),[error,setError]=useState('');

 useEffect(()=>{const controller=new AbortController();void fetch(`/api/datasets/apy/filters?state=${encodeURIComponent(stateName)}&source=${source}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('filters');return response.json() as Promise<Filters>;}).then(data=>{if(!controller.signal.aborted)setFilters(data);}).catch(()=>{if(!controller.signal.aborted)setError(t('Could not load APY filters.','APY filters load nahi ho paaye.'));});return()=>controller.abort();},[stateName,source,t]);

 useEffect(()=>{const controller=new AbortController();const query=new URLSearchParams({state:stateName,source,limit:'100',offset:String(offset)});if(district)query.set('district',district);if(crop)query.set('crop',crop);if(yearFrom)query.set('year_from',yearFrom);if(yearTo)query.set('year_to',yearTo);setLoading(true);setError('');
  void fetch(`/api/datasets/apy?${query}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('data');return response.json() as Promise<Page>;}).then(data=>{if(!controller.signal.aborted)setPage(data);}).catch(()=>{if(!controller.signal.aborted)setError(t('Could not load district yield data.','Zila yield data load nahi ho paaya.'));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[stateName,district,crop,source,yearFrom,yearTo,offset,t]);

 const num=(value:number|string|null,unit:string|null)=>value==null?'—':`${Number(value).toLocaleString(undefined,{maximumFractionDigits:2})}${unit?` ${unit}`:''}`;
 const changed=(setter:(value:string)=>void)=>(event:ChangeEvent<HTMLSelectElement>)=>{setter(event.target.value);setOffset(0);};
 return <section id="district-yield-reference" className="apy-explorer help-guide" aria-labelledby="apy-title">
  <h2 id="apy-title">{t('District crop yield reference','Zila fasal upaj ka sandarbh')}</h2>
  <p>{t('Browse official-source district aggregates for comparison. These are not measurements for an individual farm.','Zila-level official-source averages dekhein. Ye kisi individual khet ki measured upaj nahi hain.')}</p>
  <div className="apy-controls">
   <label>{t('State','Rajya')}<select value={stateName} onChange={event=>{setStateName(event.target.value);setDistrict('');setOffset(0);}}>{filters.states.map(value=><option key={value}>{value}</option>)}</select></label>
   <label>{t('District','Zila')}<select value={district} onChange={changed(setDistrict)}><option value="">{t('All districts','Sabhi zile')}</option>{filters.districts.map(value=><option key={value}>{value}</option>)}</select></label>
   <label>{t('Crop','Fasal')}<select value={crop} onChange={changed(setCrop)}><option value="">{t('Wheat and rice','Gehu aur dhan')}</option>{filters.crops.filter(value=>['wheat','rice'].includes(value.toLowerCase())).map(value=><option key={value}>{value}</option>)}</select></label>
   <label>{t('Source','Source')}<select value={source} onChange={event=>{const next=event.target.value;setSource(next);setYearFrom(next==='des'?'2022-2023':'2024-2025');setYearTo(next==='des'?'2022-2023':'2024-2025');setOffset(0);}}><option value="upag">UPAg · {t('latest district series','nayi zila series')}</option><option value="des">DES · {t('historical series','purani series')}</option></select></label>
   <label>{t('From crop year','Fasal varsh se')}<select value={yearFrom} onChange={changed(setYearFrom)}>{filters.years.map(value=><option key={value}>{value}</option>)}</select></label>
   <label>{t('To crop year','Fasal varsh tak')}<select value={yearTo} onChange={changed(setYearTo)}>{filters.years.map(value=><option key={value}>{value}</option>)}</select></label>
  </div>
  <p className="apy-note">{t('Source: DES/UPAg, mirrored by India Data Portal. Keep crop codes and units when comparing datasets.','Source: DES/UPAg, India Data Portal mirror. Datasets compare karte waqt crop codes aur units ko saath rakhein.')}</p>
  {error&&<p role="alert">{error}</p>}{loading&&<p role="status">{t('Loading yield records…','Yield records load ho rahe hain…')}</p>}
  {!loading&&!error&&<><div className="apy-table-wrap"><table><thead><tr><th>{t('Crop year','Fasal varsh')}</th><th>{t('District','Zila')}</th><th>{t('Crop','Fasal')}</th><th>{t('Season','Mausam')}</th><th>{t('Area','Kshetrafal')}</th><th>{t('Production','Utpadan')}</th><th>{t('Yield','Upaj')}</th></tr></thead><tbody>{page.items.map((row,index)=><tr key={`${row.source_id}-${row.crop_year}-${row.district_name}-${row.crop_name}-${index}`}><td>{row.crop_year}</td><td>{row.district_name}</td><td>{row.crop_name}</td><td>{row.season||'—'}</td><td>{num(row.area_value,'ha')}</td><td>{num(row.production_value,row.production_unit)}</td><td>{num(row.yield_value,row.yield_unit)}</td></tr>)}</tbody></table></div>
   {!page.items.length&&<p>{t('No district records match these filters.','In filters ke liye district records nahi mile.')}</p>}
   <div className="apy-paging"><button type="button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-page.limit))}>{t('Previous','Pichhla')}</button><span>{t('Rows','Rows')} {offset+1}–{offset+page.items.length}</span><button type="button" disabled={!page.hasMore} onClick={()=>setOffset(offset+page.limit)}>{t('Next','Agla')}</button></div>
  </>}
 </section>;
}
