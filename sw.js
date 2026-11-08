/* SPLETNI - компьютер хоста: работа без интернета (сборка 1 · 08.11.2026)
   - страницы и скрипты: сначала сеть (чтобы обновления приходили сразу), без сети - из кэша;
   - брони, схема залов, банкеты: сохраняются в кэш ТОЛЬКО под входом хоста (pc_acc=host)
     и отдаются из кэша, когда нет интернета. Себестоимость, журнал, табель, личные данные сотрудников - не кэшируются. */
const V = "spl-pc-2";
const SHELL = ["pc.html", "index.html", "banket.html", "zastavka.js", "manifest.webmanifest", "img/pc-192.png", "img/pc-512.png"];
const CDN = /cdn\.jsdelivr\.net|telegram\.org\/js/;
const DATA_OK = /\/rest\/v1\/(venues|zones|tables|deposit_special_days|closed_days|v_bookings_full|bookings|pc_settings|bq_places|bq_banquets|bq_banquet_tables|bq_removed|bq_items|bq_packs|bq_addons|bq_promos|bq_prices|bq_settings)\?/;

self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

function isHost(req){
  try{ const t = (req.headers.get("Authorization") || "").split(" ")[1] || "";
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.pc_acc === "host"; }catch(_){ return false; }
}
async function netFirst(req, key, timeoutMs){
  const c = await caches.open(V);
  try{
    const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
    if(r && r.ok) c.put(key, r.clone());
    return r;
  }catch(err){
    const hit = await c.match(key, { ignoreSearch: false });
    if(hit){ const h = new Headers(hit.headers); h.set("X-Spl-Offline", "1");
      return new Response(await hit.blob(), { status: 200, headers: h }); }
    throw err;
  }
}
self.addEventListener("fetch", e => {
  const req = e.request, url = req.url;
  if(req.method !== "GET") return;                                   // изменения - только онлайн
  if(url.includes("/rest/v1/")){
    if(DATA_OK.test(url) && isHost(req)) e.respondWith(netFirst(req, url, 6000));
    return;
  }
  if(url.includes("/functions/v1/") || url.includes("supabase.co")) return;
  if(CDN.test(url)){ e.respondWith(caches.open(V).then(async c => (await c.match(url)) || fetch(req).then(r => { if(r.ok) c.put(url, r.clone()); return r; }))); return; }
  if(new URL(url).origin === location.origin){
    const key = url.split("#")[0].split("?")[0];
    e.respondWith(netFirst(req, key, 5000).catch(() => caches.match(key)));
  }
});
