import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseForecast} from '../../../shared/forecast.ts';
const payload=()=>({timezone:'Asia/Kolkata',daily:{time:['2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02'],temperature_2m_min:Array(7).fill(0),temperature_2m_max:Array(7).fill(20),precipitation_sum:Array(7).fill(0),precipitation_probability_max:Array(7).fill(0),relative_humidity_2m_mean:Array(7).fill(50),wind_speed_10m_max:Array(7).fill(9)}});
test('forecast retains zero measurements, source, expiry and unknown issue time',()=>{const data=parseForecast(payload(),1000000);assert.equal(data.days[0].minC,0);assert.equal(data.days[0].rainChance,0);assert.equal(data.issuedAt,null);assert.equal(Date.parse(data.expiresAt)-Date.parse(data.retrievedAt),1800000);assert.equal(data.provenance,'forecast');});
test('forecast rejects incomplete, unordered or impossible measurements',()=>{for(const mutate of [(p:ReturnType<typeof payload>)=>p.daily.time.pop(),(p:ReturnType<typeof payload>)=>p.daily.time.reverse(),(p:ReturnType<typeof payload>)=>p.daily.temperature_2m_min[0]=50,(p:ReturnType<typeof payload>)=>p.daily.precipitation_probability_max[0]=200]){const value=payload();mutate(value);assert.throws(()=>parseForecast(value));}});
import {normaliseForecast,forecastUrl} from './forecast.ts';
test('forecast provider request uses seven days and weather variables',()=>{
 const url=new URL(forecastUrl(28.5,77.2));
 assert.equal(url.hostname,'api.open-meteo.com');
 assert.equal(url.searchParams.get('forecast_days'),'7');
 assert.match(url.searchParams.get('daily')||'',/precipitation_probability_max/);
});
test('normalizes valid provider response and derives daily humidity',()=>{
 const data=normaliseForecast({timezone:'Asia/Kolkata',daily:{time:['2026-10-19','2026-10-20'],temperature_2m_min:[20,19],temperature_2m_max:[31,30],precipitation_probability_max:[75,10],precipitation_sum:[12,0],wind_speed_10m_max:[12,9]},hourly:{time:['2026-10-19T00:00','2026-10-19T01:00'],relative_humidity_2m:[60,80]}},'sample-id','2026-10-19T00:00:00Z');
 assert.equal(data.days[0].humidity_percent,70);
 assert.equal(data.days[0].precipitation_mm,12);
 assert.equal(data.days[1].humidity_percent,null);
 assert.equal(data.source,'Open-Meteo');
});
test('invalid date arrays and values are rejected rather than fabricated',()=>{
 assert.throws(()=>normaliseForecast({daily:{time:[]}},'id','now'),/incomplete/);
 const data=normaliseForecast({daily:{time:['2026-10-19'],temperature_2m_max:[999],precipitation_sum:[-1]}},'id','now');
 assert.equal(data.days[0].max_c,null);
 assert.equal(data.days[0].precipitation_mm,null);
});
