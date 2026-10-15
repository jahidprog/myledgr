const CACHE='shohel-shell-v3';
const BASE=new URL('./',self.registration.scope);
const FILES=['','index.html','app.js','styles.css','manifest.webmanifest','icon.svg'].map(x=>new URL(x,BASE).toString());
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(u.origin!==location.origin||event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(r=>{caches.open(CACHE).then(c=>c.put(event.request,r.clone()));return r}).catch(()=>caches.match(event.request).then(r=>r||caches.match(new URL('index.html',BASE).toString()))))});
