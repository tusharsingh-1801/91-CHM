import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsLargeImageBody} from './requestLimits.ts';
import {app} from '../app.ts';
import type {AddressInfo} from 'node:net';

const id='00000000-0000-0000-0000-000000000001';
test('only bounded image routes get the larger JSON parser',()=>{
 assert.equal(needsLargeImageBody('POST',`/api/fields/${id}/scouting`),true);
 assert.equal(needsLargeImageBody('POST',`/api/fields/${id}/scouting/quality-preview?mode=check`),true);
 assert.equal(needsLargeImageBody('POST','/api/research/potato-leaf/predict'),true);
 assert.equal(needsLargeImageBody('GET',`/api/fields/${id}/scouting`),false);
 assert.equal(needsLargeImageBody('POST',`/api/fields/${id}/events`),false);
 assert.equal(needsLargeImageBody('POST','/api/fields/../../scouting/quality-preview'),false);
 assert.equal(needsLargeImageBody('POST','/api/assistant'),false);
});
test('128KB body cap stays for regular APIs and image routes use their bounded parser',async()=>{
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;
  const big=JSON.stringify({image:'a'.repeat(150_000)});
  const request=(path:string)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:big});
  const regular=await request('/api/assistant');
  assert.equal(regular.status,413);
  const preview=await request(`/api/fields/${id}/scouting/quality-preview`);
  assert.notEqual(preview.status,413);
  const potato=await request('/api/research/potato-leaf/predict');
  assert.notEqual(potato.status,413);
  assert.equal(preview.headers.get('x-frame-options'),'DENY');
  assert.equal(preview.headers.get('x-content-type-options'),'nosniff');
  assert.equal(preview.headers.get('referrer-policy'),'same-origin');
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('default JSON parser ignores text/plain and still rejects malformed application/json',async()=>{
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as AddressInfo;
  const url=`http://127.0.0.1:${address.port}/api/assistant`;
  const plain=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{invalid json'});
  assert.notEqual(plain.status,400,'plain text should not trigger JSON parse errors');
  const malformed=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid json'});
  assert.equal(malformed.status,400);
  assert.equal(((await malformed.json()) as {error:string}).error,'The submitted data is not valid JSON');
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
