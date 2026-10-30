import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';
import {providerJson} from './provider.ts';
import {parseForecast,type Forecast} from '../../../shared/forecast.ts';
const cache=new Map<string,{value:Forecast;latitude:number;longitude:number}>();
const pending=new Map<string,Promise<Forecast>>();
export class ForecastProviderError extends Error {
 readonly provider:'Google Weather API'|'Open-Meteo';
 constructor(provider:'Google Weather API'|'Open-Meteo'){super('Weather provider request failed');this.provider=provider;}
}
export async function forecastFor(fieldId:string):Promise<Forecast>{
 const field=(await pool.query<{latitude:number|null;longitude:number|null}>('select ST_Y(location) latitude,ST_X(location) longitude from fields where id=$1',[fieldId])).rows[0];
 if(!field||field.latitude===null||field.longitude===null)throw new Error('Add field coordinates to enable the forecast');
 const {latitude,longitude}=field;
 const key=fieldId+':'+latitude+':'+longitude;
 const preferredSource=process.env.GOOGLE_WEATHER_API_KEY?.trim()?'Google Weather API':'Open-Meteo';
 const stored=(await pool.query<{payload:Forecast}>('select payload from field_forecasts where field_id=$1 and latitude=$2 and longitude=$3 and expires_at>now()',[fieldId,latitude,longitude])).rows[0];if(stored?.payload.source===preferredSource)return stored.payload;
 const cached=cache.get(key);if(cached&&cached.value.source===preferredSource&&Date.parse(cached.value.expiresAt)>Date.now())return cached.value;
 if(pending.has(key))return pending.get(key)!;
 const work=(async()=>{
  const googleKey=process.env.GOOGLE_WEATHER_API_KEY?.trim();
  let value:Forecast;
  try{
   let raw:unknown;
   if(googleKey){
    const url=new URL('https://weather.googleapis.com/v1/forecast/days:lookup');
    url.search=new URLSearchParams({key:googleKey,'location.latitude':String(latitude),'location.longitude':String(longitude),days:'7',pageSize:'7',unitsSystem:'METRIC'}).toString();
    raw=googleDailyToForecast(await providerJson(url.href));
   }else{
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean,wind_speed_10m_max',current:'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',forecast_days:'7',timezone:'auto'}).toString();
    raw=await providerJson(url.href);
   }
   value=parseForecast(raw);
  }catch{throw new ForecastProviderError(googleKey?'Google Weather API':'Open-Meteo');}
  await pool.query('insert into field_forecasts(field_id,latitude,longitude,retrieved_at,expires_at,payload) values($1,$2,$3,$4,$5,$6) on conflict(field_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,retrieved_at=excluded.retrieved_at,expires_at=excluded.expires_at,payload=excluded.payload',[fieldId,latitude,longitude,value.retrievedAt,value.expiresAt,JSON.stringify(value)]);
  if(cache.size>=500)cache.delete(cache.keys().next().value!);cache.set(key,{value,latitude,longitude});return value;
 })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}

/** Convert Google's seven daily periods into the shared forecast shape. */
function googleDailyToForecast(value:unknown):unknown{
 const data=value as {forecastDays?:Array<Record<string,any>>;timeZone?:{id?:string}};
 if(!Array.isArray(data?.forecastDays)||data.forecastDays.length!==7)throw new Error('Google Weather returned incomplete forecast data');
 const read=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const days=data.forecastDays.map(day=>{
  const date=day.displayDate;
  const dateString=date&&[date.year,date.month,date.day].every((part:unknown)=>Number.isInteger(part))
   ?`${String(date.year).padStart(4,'0')}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`:'';
  const daytime=day.daytimeForecast??{},nighttime=day.nighttimeForecast??{};
  const qpf=(period:Record<string,any>)=>read(period.precipitation?.qpf?.quantity);
  const precipitation=[qpf(daytime),qpf(nighttime)].every((n)=>n!==null)?(qpf(daytime)!+qpf(nighttime)!):null;
  const probability=[read(daytime.precipitation?.probability?.percent),read(nighttime.precipitation?.probability?.percent)].filter((n):n is number=>n!==null);
  const humidity=[read(daytime.relativeHumidity),read(nighttime.relativeHumidity)].filter((n):n is number=>n!==null);
  const wind=[read(daytime.wind?.speed?.value),read(nighttime.wind?.speed?.value)].filter((n):n is number=>n!==null);
  return {date:dateString,minC:read(day.minTemperature?.degrees),maxC:read(day.maxTemperature?.degrees),rainMm:precipitation,rainChance:probability.length?Math.max(...probability):null,humidity:humidity.length?humidity.reduce((a,b)=>a+b,0)/humidity.length:null,windKph:wind.length?Math.max(...wind):null};
 });
 return {source:'Google Weather API',sourceUrl:'https://developers.google.com/maps/documentation/weather',timezone:data.timeZone?.id??'UTC',current:null,daily:{time:days.map(day=>day.date),temperature_2m_min:days.map(day=>day.minC),temperature_2m_max:days.map(day=>day.maxC),precipitation_sum:days.map(day=>day.rainMm),precipitation_probability_max:days.map(day=>day.rainChance),relative_humidity_2m_mean:days.map(day=>day.humidity),wind_speed_10m_max:days.map(day=>day.windKph)}};
}
export async function getForecast(request:Request,response:Response){
 try{response.json(await forecastFor(String(request.params.fieldId)));}catch(error){
  const noLocation=error instanceof Error&&error.message.startsWith('Add field');
  if(noLocation){response.status(422).json({error:'Add field coordinates to enable the forecast'});return;}
  response.status(503).json({error:forecastFailureMessage(error)});
 }
}
export function forecastFailureMessage(error:unknown):string{
 if(error instanceof ForecastProviderError&&error.provider==='Google Weather API')return 'Google Weather API is unavailable. Check that the Weather API is enabled, billing is active, and server key restrictions allow this request. Historical weather is unchanged.';
 if(error instanceof ForecastProviderError)return 'Open-Meteo is unavailable. Check the connection and retry. Historical weather is unchanged.';
 return 'The forecast service could not complete the request. Historical weather is unchanged; retry shortly.';
}

/** Seven-day field forecast. Separate from historical NASA POWER observations. */
export type ForecastDay={date:string;min_c:number|null;max_c:number|null;rain_probability_percent:number|null;precipitation_mm:number|null;humidity_percent:number|null;wind_speed_kmh:number|null};
export type FieldForecast={source:'Open-Meteo';source_url:string;field_id:string;issued_at:string;timezone:string;units:{temperature:'°C';precipitation:'mm';wind_speed:'km/h'};days:ForecastDay[]};
const num=(value:unknown, min=-Infinity,max=Infinity):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
const iso=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'';
export function normaliseForecast(payload:unknown,fieldId:string,issuedAt:string):FieldForecast{
 if(!payload||typeof payload!=='object')throw new Error('Forecast provider returned invalid data');
 const obj=payload as Record<string,unknown>;
 const daily=obj.daily as Record<string,unknown>|undefined;
 if(!daily||!Array.isArray(daily.time)||daily.time.length<1||daily.time.length>7)throw new Error('Forecast provider returned incomplete dates');
 const hourly=obj.hourly as Record<string,unknown>|undefined;
 const hours=Array.isArray(hourly?.time)?hourly.time:[];
 const humidity=Array.isArray(hourly?.relative_humidity_2m)?hourly.relative_humidity_2m:[];
 const averageHumidity=(day:string):number|null=>{
  const values=hours.map((time,i)=>String(time).startsWith(day)?num(humidity[i],0,100):null).filter((value):value is number=>value!==null);
  return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null;
 };
 const array=(key:string,index:number)=>Array.isArray(daily[key])?daily[key][index]:null;
 const days:ForecastDay[]=daily.time.map((value,index)=>{
  const date=iso(value);if(!date)throw new Error('Invalid forecast date');
  return {date,min_c:num(array('temperature_2m_min',index),-100,75),max_c:num(array('temperature_2m_max',index),-100,75),
   rain_probability_percent:num(array('precipitation_probability_max',index),0,100),
   precipitation_mm:num(array('precipitation_sum',index),0,2000),
   humidity_percent:averageHumidity(date),wind_speed_kmh:num(array('wind_speed_10m_max',index),0,500)};
 });
 return {source:'Open-Meteo',source_url:'https://open-meteo.com/',field_id:fieldId,issued_at:issuedAt,
  timezone:typeof obj.timezone==='string'?obj.timezone:'auto',
  units:{temperature:'°C',precipitation:'mm',wind_speed:'km/h'},days};
}
export function forecastUrl(lat:number,lon:number){
 const url=new URL('https://api.open-meteo.com/v1/forecast');
 url.searchParams.set('latitude',String(lat));url.searchParams.set('longitude',String(lon));
 url.searchParams.set('forecast_days','7');url.searchParams.set('timezone','auto');
 url.searchParams.set('daily','temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max');
 url.searchParams.set('hourly','relative_humidity_2m');
 return url.toString();
}
