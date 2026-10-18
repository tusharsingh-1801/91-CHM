const CACHE='terrascope-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/favicon.svg','/manifest.webmanifest'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('terrascope-shell-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||req.mode==='navigate')return;
 if(!/^\/(assets\/|favicon\.svg$|manifest\.webmanifest$)/.test(url.pathname))return;
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok&&response.type==='basic'){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;})));
});
