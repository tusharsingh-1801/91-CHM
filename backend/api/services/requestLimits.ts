/** Routes with explicitly bounded image JSON bodies; other APIs remain at 128 KB. */
export function needsLargeImageBody(method:string,path:string):boolean{
 const normalized=path.split('?',1)[0];
 return method==='POST'&&(
  /^\/api\/fields\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/scouting(?:\/quality-preview)?$/i.test(normalized)||
  normalized==='/api/research/potato-leaf/predict'
 );
}
