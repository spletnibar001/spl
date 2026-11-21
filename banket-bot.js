/* SPLETNI · «Банкет» в гостевом приложении (guest.html, бот @spletni_ai_bot)
   Сборка 10 · 19.11.2026 - «Своё меню»: гость сам собирает блюда (шаг 4), подсказки по нормам, состав уходит в заявку
   Сборка 9 · 19.11.2026 - подарок по акции: только за полное число гостей (вниз)
   Сборка 8 · 19.11.2026 - напитки и алкоголь в составе пакета внизу
   Сборка 7 · 19.11.2026 - алкоголь в литрах: шаг 0,5 л
   Сборка 6 · 19.11.2026 - алкоголь в пакете округляется обычным образом, не вверх
   Сборка 5 · 19.11.2026 - состав пакета: раздел меню округляется целиком, добавка - блюдам по порядку
   Сборка 4 · 19.11.2026 - до 6 фото у зала: точки на карточке, по нажатию - просмотр со свайпом
   Сборка 3 · 18.11.2026 - состав пакета пропорционально гостям
   Сборка 2 · 18.11.2026 - количество подарка по числу гостей
   Сборка 1 · 18.11.2026 - тестовый доступ: раздел видят только тестеры (bq_bot_testers) или все, когда
   в программе банкетов включено «Заявки гостей на банкет».
   3 шага: гости, дата и повод -> зал или кабинка -> предложение (GOLD / PLATINUM / DIAMOND или «своё меню»).
   Заявка падает в программу банкетов в «Новые» (источник «Гостевой бот»), гостю - сообщение в бот.
   Вход - токен guest-auth (подпись Telegram); данные - rpc bq_bot(действие, данные). Себестоимости здесь нет.
   Использует из guest.html: SB, guestAuth(), go(), esc(), PHONE_KAR. */
(function(){
"use strict";
const BQ = { info:null, step:1, g:10, date:"", time:"19:00", occ:"", place:"", pack:"", own:false, sel:{}, msec:0,
  name:"", phone:"", wish:"", busy:[], busyDate:"", done:null, err:"", sending:false, open:null, video:null };
const MON = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WD = ["вс","пн","вт","ср","чт","пт","сб"];
const ST = { new:"Новая - менеджер свяжется", work:"В работе у менеджера", confirmed:"Ждём депозит", cashier:"Депозит на кассе", paid:"Депозит внесён", done:"Прошёл" };
const fmt = n => Number(n || 0).toLocaleString("ru-RU").replace(/ /g, " ");
const fmt1 = n => String(Math.round(n * 10) / 10).replace(".", ",");
const pl = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) ? b : c; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dObj = s => s ? new Date(s + "T12:00:00") : null;
const dLab = s => { const d = dObj(s); return d ? d.getDate() + " " + MON[d.getMonth()] + ", " + WD[d.getDay()] : ""; };
const sec = () => document.getElementById("sec-banket");
function haptic(k){ try{ Telegram.WebApp.HapticFeedback.selectionChanged(); if (k) Telegram.WebApp.HapticFeedback.notificationOccurred(k); }catch(_){} }
function toastQ(t){ try{ Telegram.WebApp.showAlert(t); }catch(_){ alert(t); } }

const CSS = `
.bq-plate{border:2px solid var(--gold);background:linear-gradient(135deg,#1d1a12,#15181d);border-radius:16px;padding:14px;margin:0 0 12px;cursor:pointer;color:var(--text);width:100%;text-align:left;font-family:inherit}
.bq-plate b{display:block;font-size:16px}.bq-plate span{color:var(--muted);font-size:12px;line-height:1.45;display:block;margin-top:2px}
.bq-plate .pr{display:flex;gap:6px;margin-top:10px}.bq-plate .pr div{flex:1;border-radius:9px;padding:6px 4px;text-align:center;font-size:10px;font-weight:800;letter-spacing:.5px;background:#111418;border:1px solid var(--line)}
.bq-plate .pr em{display:block;font-style:normal;font-weight:700;color:var(--text);font-size:12px;letter-spacing:0;margin-top:2px}
.bq-plate .tst{display:inline-block;margin-left:6px;font-size:9px;font-weight:800;color:#111;background:var(--gold);border-radius:6px;padding:2px 6px;vertical-align:middle}
.bq-g{color:#d9b25c}.bq-p{color:#cfd6dd}.bq-d{color:#8fd3ff}
.bq-stp{display:flex;gap:6px;margin:2px 0 6px}.bq-stp div{flex:1;height:4px;border-radius:2px;background:var(--line)}.bq-stp div.on{background:var(--emerald)}
.bq-stl{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px}.bq-stl b{color:var(--text);font-weight:700}
.bq-h{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin:16px 0 8px}
.bq-cnt{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:10px}
.bq-cnt b{font-size:34px;font-weight:700}
.bq-q{width:46px;height:46px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font-size:22px;font-family:inherit}
.bq-two{display:grid;grid-template-columns:1.4fr 1fr;gap:8px}
.bq-chips{display:flex;flex-wrap:wrap;gap:7px}
.bq-chip{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:18px;padding:8px 12px;font-size:13px;font-family:inherit}
.bq-chip.on{border:2px solid var(--emerald);padding:7px 11px}
.bq-gift{border:1px solid rgba(31,191,122,.45);background:rgba(31,191,122,.08);border-radius:11px;padding:10px 12px;font-size:13px;margin-top:12px;line-height:1.45}
.bq-gift b{color:var(--emerald)}
.bq-hint{font-size:12px;color:var(--muted);line-height:1.45;margin-top:6px}
.bq-pls{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.bq-pl{border:1px solid var(--line);background:var(--panel);border-radius:13px;overflow:hidden;text-align:left;color:var(--text);padding:0;font-family:inherit}
.bq-pl.on{border:2px solid var(--emerald)}.bq-pl.no{opacity:.38}
.bq-pl .im{height:78px;background:linear-gradient(135deg,#2a2f37,#1a1d22) center/cover no-repeat;position:relative}
.bq-pl .im em{position:absolute;right:6px;bottom:6px;font-style:normal;font-size:10px;font-weight:700;background:rgba(0,0,0,.65);border-radius:6px;padding:2px 7px;color:#fff}
.bq-pl .im .dt{position:absolute;left:0;right:0;bottom:6px;display:flex;justify-content:center;gap:4px}
.bq-pl .im .dt i{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.5)}.bq-pl .im .dt i:first-child{background:#fff;width:12px;border-radius:3px}
.bq-pl .im .nf{position:absolute;left:6px;top:6px;font-size:10px;font-weight:700;background:rgba(0,0,0,.65);border-radius:6px;padding:2px 7px;color:#fff}
.bq-gal{position:fixed;inset:0;z-index:210;background:#000;display:flex;flex-direction:column;color:#fff}
.bq-gal .hd{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;font-size:15px;font-weight:700}
.bq-gal .hd span{font-size:12px;color:#aaa;font-weight:600}
.bq-gal .ph{flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;touch-action:pan-y}
.bq-gal .ph img{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none}
.bq-gal .ar{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.25);color:#fff;font-size:20px;font-family:inherit}
.bq-gal .ar.l{left:10px}.bq-gal .ar.r{right:10px}
.bq-gal .dt{display:flex;justify-content:center;gap:6px;padding:10px 0}
.bq-gal .dt i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.4)}.bq-gal .dt i.on{background:#fff;width:18px;border-radius:4px}
.bq-gal .th{display:flex;gap:6px;padding:0 14px;overflow-x:auto}
.bq-gal .th button{flex:none;width:54px;height:54px;border-radius:9px;background:#222 center/cover;border:1px solid transparent;opacity:.5;padding:0}
.bq-gal .th button.on{opacity:1;border:2px solid var(--emerald)}
.bq-gal .bt{display:flex;flex-direction:column;gap:8px;padding:12px 16px calc(14px + env(safe-area-inset-bottom))}
.bq-pl .bd{padding:8px 10px 10px}.bq-pl b{font-size:13px;display:block}.bq-pl span{font-size:11px;color:var(--muted);display:block}
.bq-pl .why{color:#e06464;font-weight:700}
.bq-pk{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:12px 13px;margin-bottom:9px;text-align:left;color:var(--text);width:100%;font-family:inherit;display:block}
.bq-pk.on{border:2px solid var(--emerald);padding:11px 12px}
.bq-pk .t{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.bq-pk .t b{font-size:16px;letter-spacing:1.5px}.bq-pk .t span{font-size:15px;font-weight:800;white-space:nowrap}.bq-pk .t small{font-size:11px;color:var(--muted);font-weight:500}
.bq-pk .ds{font-size:12px;color:var(--muted);margin:2px 0 6px}
.bq-pk .it{font-size:12px;line-height:1.5;color:#cdd3d9}
.bq-pk .lk{font-size:12px;color:var(--emerald);margin-top:6px;font-weight:700}
.bq-comp{margin-top:8px;border-top:1px solid var(--line);padding-top:8px}
.bq-comp div{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:3px 0;color:#cdd3d9}.bq-comp div span:last-child{white-space:nowrap;color:var(--muted)}
.bq-sum{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:12px;margin-top:14px}
.bq-sum .r{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.bq-sum .r span{font-size:12px;color:var(--muted)}.bq-sum .r b{font-size:20px;white-space:nowrap}
.bq-msg{color:var(--hot);font-size:13px;min-height:18px;margin-top:10px}
.bq-ok{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 0 4px}
.bq-ok .ring{width:62px;height:62px;border-radius:50%;border:3px solid var(--emerald);margin-bottom:12px}
.bq-ok b{font-size:19px}.bq-ok p{font-size:13px;color:var(--muted);line-height:1.5;margin:8px 4px 12px}
.bq-id{font-size:13px;font-weight:800;color:#e5383b;letter-spacing:.5px;margin-top:4px}
.bq-kv{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line)}.bq-kv span{color:var(--muted)}.bq-kv:last-child{border:0}.bq-kv b{text-align:right}
.bq-mine{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px}
.bq-mine .s{font-size:12px;color:var(--gold);font-weight:700}
.bq-vid{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:14px}
.bq-vid video{max-width:100%;max-height:80vh;border-radius:12px}
.bq-own{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:12px 13px;margin-bottom:9px}
.bq-own.on{border:2px solid var(--emerald);padding:11px 12px}
.bq-own b{font-size:14px;display:block}.bq-own .ds{font-size:12px;color:var(--muted);margin:2px 0 10px}
.bq-own .bt{display:flex;gap:8px}
.bq-own .bt button{flex:1;border-radius:11px;padding:10px 6px;font-size:13px;font-weight:700;font-family:inherit;border:1px solid var(--line);background:var(--panel2);color:var(--text)}
.bq-own .bt button small{display:block;font-weight:500;font-size:11px;margin-top:2px;opacity:.8}
.bq-own .bt button.go{background:var(--emerald);border-color:var(--emerald);color:#08130d}
.bq-own .bt button.on{border:2px solid var(--emerald);padding:9px 5px}
.bq-sec{display:flex;gap:7px;overflow-x:auto;margin:6px -14px 10px;padding:0 14px 2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.bq-sec::-webkit-scrollbar{display:none}
.bq-sec button{flex:none;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:18px;padding:8px 12px;font-size:13px;font-family:inherit;white-space:nowrap}
.bq-sec button.on{border:2px solid var(--emerald);padding:7px 11px;font-weight:700}
.bq-sec button i{font-style:normal;color:var(--emerald);font-weight:800;margin-left:5px}
.bq-norm{border:1px solid rgba(201,161,74,.5);background:rgba(201,161,74,.08);border-radius:11px;padding:9px 12px;font-size:13px;line-height:1.45;margin-bottom:10px}
.bq-norm b{color:#e3c479}
.bq-dish{display:flex;gap:10px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:9px;margin-bottom:8px}
.bq-dish.on{border:2px solid var(--emerald);padding:8px}
.bq-dish .im{width:56px;height:56px;border-radius:10px;flex:none;background:linear-gradient(135deg,#2a2f37,#1a1d22) center/cover no-repeat}
.bq-dish .tx{flex:1;min-width:0}.bq-dish .tx b{display:block;font-size:13.5px;line-height:1.25}.bq-dish .tx span{font-size:12.5px;color:var(--muted)}
.bq-dish .tx em{font-style:normal;color:var(--text);font-weight:700}
.bq-ctr{display:flex;align-items:center;gap:6px;flex:none}
.bq-ctr button{width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font-size:18px;font-family:inherit;padding:0}
.bq-ctr b{font-size:14px;min-width:30px;text-align:center;white-space:nowrap}
.bq-add{flex:none;border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:13px;font-weight:700;background:var(--panel2);color:var(--text);font-family:inherit}
.bq-foot{position:sticky;bottom:calc(56px + env(safe-area-inset-bottom));z-index:5;background:rgba(13,15,18,.97);border-top:1px solid var(--line);margin:12px -14px 0;padding:10px 14px 12px}
.bq-foot .r{display:flex;justify-content:space-between;align-items:center;gap:10px}.bq-foot .r span{font-size:12px;color:var(--muted);line-height:1.4}.bq-foot .r b{font-size:20px;white-space:nowrap}
.bq-foot .bk-submit{margin-top:8px}
.bq-ln{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)}
.bq-ln span:last-child{white-space:nowrap;color:var(--muted)}
.bq-ln.t{font-weight:800;border:0;padding-top:10px;font-size:15px}.bq-ln.t span:last-child{color:var(--text)}
.bq-gh{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:10px 0 2px;display:flex;justify-content:space-between;align-items:center}
.bq-gh button{background:none;border:none;color:var(--emerald);font-size:12px;font-weight:700;font-family:inherit;padding:2px 0}
.bq-warn{border:1px solid rgba(201,161,74,.5);background:rgba(201,161,74,.08);border-radius:11px;padding:9px 12px;font-size:13px;line-height:1.45;margin-top:10px}
.bq-back{background:none;border:none;color:var(--muted);font-size:13px;padding:6px 0;font-family:inherit}
`;
function injectCss(){ if (document.getElementById("bq-css")) return; const s = document.createElement("style"); s.id = "bq-css"; s.textContent = CSS; document.head.appendChild(s); }

async function rpc(action, args){
  if (!(await guestAuth())) return { error:"auth" };
  try { const { data, error } = await SB.rpc("bq_bot", { p_action:action, p_args:args || {} }); if (error) return { error:error.message }; return data || {}; }
  catch(e){ return { error:String(e.message || e) }; }
}

/* ---------- расчёты ---------- */
const P = id => ((BQ.info && BQ.info.places) || []).find(p => p.id === id);
const K = id => ((BQ.info && BQ.info.packs) || []).find(p => p.id === id);
const mult = () => Math.max(1, Math.ceil(BQ.g / ((BQ.info && BQ.info.packBase) || 10)));
/* сборка 3: состав пакета - пропорционально гостям, вверх (как в программе банкетов) */
function packQty(qty, g){ const q = +qty || 0; if (!(q > 0)) return 0; const base = (BQ.info && BQ.info.packBase) || 10, step = q % 1 === 0 ? 1 : 0.5;
  return Math.max(step, Math.ceil(q * (+g || 1) / base / step - 1e-9) * step); }
/* сборка 5: как в программе банкетов (сборка 60) - округляем раздел целиком, добавка по порядку в пакете */
function packQtys(items, g){
  const base = (BQ.info && BQ.info.packBase) || 10, k = (+g || 1) / base, out = items.map(() => 0), G = new Map();
  items.forEach((r, i) => { const q = +r.q || 0; if (!(q > 0)) return;
    if (r.g === "~"){ const st = r.u === "л" || q % 1 !== 0 ? 0.5 : 1; out[i] = Math.max(st, Math.round(q * k / st + 1e-9) * st); return; }
    const key = r.g || "#" + i; if (!G.has(key)) G.set(key, []); G.get(key).push(i); });
  G.forEach(ix => { const st = ix.every(i => (+items[i].q) % 1 === 0) ? 1 : 0.5;
    const ex = ix.map(i => (+items[i].q) * k / st), fl = ex.map(e => Math.floor(e + 1e-9));
    let left = Math.ceil(ex.reduce((a, e) => a + e, 0) - 1e-9) - fl.reduce((a, e) => a + e, 0);
    ix.forEach((i, n) => { let v = fl[n]; if (left > 0 && ex[n] - fl[n] > 1e-9){ v++; left--; } out[i] = Math.max(st, v * st); }); });
  return out;
}
/* ---------- сборка 10: своё меню - гость собирает сам ---------- */
function loadMenu(){ return new Promise(res => { if (window.BQ_MENU) return res(true);
  const sc = document.createElement("script"); sc.src = "banket-menu.js?v=2"; sc.onload = () => res(!!window.BQ_MENU); sc.onerror = () => res(false); document.head.appendChild(sc); }); }
const STRONG = ["Водка", "Виски", "Коньяк и бренди"];
function catalog(){
  if (BQ.cat) return BQ.cat;
  const I = BQ.info || {}, pr = I.prices || {}, ph = I.mphotos || {}, low = x => String(x || "").toLowerCase().replace(/ё/g, "е");
  const secs = (window.BQ_MENU || []).map(g => ({ t:g.t, bar:g.bar, items:g.items.map(([id, n, p, u]) => ({ ref:"m:" + id, n, u:u || "шт",
    p: pr[id] != null ? +pr[id] : pr["m:" + id] != null ? +pr["m:" + id] : +p, ph: ph[id] || "" })) }));
  const menuNames = secs.filter(x => STRONG.includes(x.t)).flatMap(x => x.items.map(i => low(i.n)));
  const own = (I.own || []).filter(o => !menuNames.some(n => low(o.n).includes(n))).map(o => ({ ref:"c:" + o.id, n:o.n, u:o.u || "шт", p:+o.p || 0, ph:o.photo || "" }));
  if (own.length){ const at = secs.findIndex(x => x.t === "Лимонады"); secs.splice(at < 0 ? secs.length : at, 0, { t:"Шампанское и напитки", bar:1, items:own }); }
  const by = {}; secs.forEach((x, si) => x.items.forEach(i => { i.si = si; by[i.ref] = i; }));
  return (BQ.cat = { secs, by, anyPh: Object.values(by).some(i => i.ph) });   // пока фото блюд не загружены - список без пустых плашек
}
const stepOf = it => it.u === "л" ? 0.5 : 1;
const qtyTxt = (it, q) => fmt1(q) + (it.u === "шт" ? "" : " " + it.u);
function selLines(){ const C = catalog(); return Object.entries(BQ.sel || {}).filter(([r, q]) => C.by[r] && +q > 0).map(([r, q]) => ({ it:C.by[r], q:+q })); }
const selSum = () => selLines().reduce((a, l) => a + l.it.p * l.q, 0);
const secCount = si => selLines().filter(l => l.it.si === si).length;
/* подсказки количества - те же нормы, что в программе банкетов (Настройки -> Правила) */
function normFor(t){
  const N = (BQ.info && BQ.info.norms) || {}, g = BQ.g, T = Math.max(1, Math.ceil(g / (+N.seatsT || 6))), num = (v, d) => v == null || v === "" ? d : +v;
  const R = [
    { groups:["Салаты"], need: num(N.salT, 2) * T, txt:["салат", "салата", "салатов"] },
    { groups:["Холодные закуски"], need: num(N.coldT, 2) * T, txt:["холодную закуску", "холодные закуски", "холодных закусок"] },
    { groups:["Горячие закуски"], need: num(N.hsT, 2) * T, txt:["горячую закуску", "горячие закуски", "горячих закусок"] },
    { groups:["Горячие блюда", "Кавказские шашлыки", "Колбаски"], need: Math.ceil(num(N.hotG, 1) * g), txt:["порцию горячего", "порции горячего", "порций горячего"], note:"Сет на компанию заменяет несколько порций." },
    { groups:["Гарниры"], need: num(N.garT, 2) * T, txt:["гарнир", "гарнира", "гарниров"] },
    { groups:STRONG, need: Math.round(num(N.strong, 0.25) * g * 2) / 2, litres:true },
    { groups:["Лимонады"], need: Math.ceil(g / (+N.lemonadeFor || 4)), txt:["графин лимонада", "графина лимонада", "графинов лимонада"] } ];
  const r = R.find(x => x.groups.includes(t)); if (!r || !(r.need > 0)) return "";
  const C = catalog(), have = Math.round(selLines().filter(l => r.groups.includes(C.secs[l.it.si].t)).reduce((a, l) => a + l.q, 0) * 10) / 10;
  const gs = `<b>${g} ${pl(g, "гостя", "гостей", "гостей")}</b>`;
  const what = r.litres ? `<b>${fmt1(r.need)} л</b> крепкого` : `<b>${r.need} ${pl(r.need, r.txt[0], r.txt[1], r.txt[2])}</b>`;
  const mine = have ? ` У вас ${fmt1(have)}${r.litres ? " л" : ""}${have < r.need ? " - можно добавить ещё " + fmt1(r.need - have) + (r.litres ? " л" : "") : ""}.` : "";
  return `<div class="bq-norm">На ${gs} обычно берут ${what}.${mine}${r.note ? " " + r.note : ""}</div>`;
}
function ownSteps(){ return `<div class="bq-stp">${[1,2,3,4].map(() => `<div class="on"></div>`).join("")}</div>
  <div class="bq-stl"><span>Гости и дата</span><span>Зал</span><span>Предложение</span><b>Меню</b></div>`; }
function view4(){
  const C = catalog(), si = Math.min(BQ.msec || 0, C.secs.length - 1), S = C.secs[si], n = selLines().length, sum = selSum();
  return `${ownSteps()}<button class="bq-back" data-a="to" data-v="3">← Предложения</button>
    <div class="bq-sec" id="bq-sec">${C.secs.map((x, i) => { const c = secCount(i); return `<button class="${i === si ? "on" : ""}" data-a="msec" data-v="${i}">${esc(x.t)}${c ? `<i>${c}</i>` : ""}</button>`; }).join("")}</div>
    ${normFor(S.t)}
    ${S.items.map(it => { const q = +(BQ.sel[it.ref] || 0);
      return `<div class="bq-dish ${q ? "on" : ""}">${C.anyPh ? `<div class="im" ${it.ph ? `style="background-image:url('${esc(it.ph)}')"` : ""}></div>` : ""}
        <div class="tx"><b>${esc(it.n)}</b><span><em>${fmt(it.p)}</em>${it.u === "шт" ? "" : " · за " + esc(it.u === "л" ? "1 л" : it.u)}</span></div>
        ${q ? `<div class="bq-ctr"><button data-a="dq" data-v="${esc(it.ref)}" data-d="-1">-</button><b>${esc(qtyTxt(it, q))}</b><button data-a="dq" data-v="${esc(it.ref)}" data-d="1">+</button></div>`
            : `<button class="bq-add" data-a="dq" data-v="${esc(it.ref)}" data-d="1">Добавить</button>`}</div>`; }).join("")}
    ${si < C.secs.length - 1 ? `<button class="bk-submit ghost" data-a="msec" data-v="${si + 1}">Дальше - ${esc(C.secs[si + 1].t.toLowerCase())}</button>` : ""}
    <div class="bq-foot"><div class="r"><span>${n ? "Выбрано " + n + " " + pl(n, "позиция", "позиции", "позиций") + "<br>" + fmt(Math.round(sum / BQ.g)) + " на гостя" : "Пока ничего не выбрано"}</span><b>${n ? fmt(sum) : ""}</b></div>
      <button class="bk-submit" data-a="review" ${n ? "" : "disabled style=\"opacity:.45\""}>Смотреть мой выбор</button></div>`;
}
function view5(){
  const C = catalog(), L = selLines(), sum = selSum(), gf = gifts(sum), p = P(BQ.place), dep = p && p.kind !== "hall" ? +p.dep || 0 : 0;
  const groups = C.secs.map((x, i) => ({ x, i, l:L.filter(z => z.it.si === i) })).filter(z => z.l.length);
  return `${ownSteps()}<button class="bq-back" data-a="to" data-v="4">← Добавить или убрать блюда</button>
    <div class="bq-h" style="margin-top:6px">Ваш банкет</div>
    <div class="info-card" style="padding:10px 14px;font-size:13px;line-height:1.55">${esc(dLab(BQ.date))}, ${esc(BQ.time)} · ${BQ.g} ${pl(BQ.g, "гость", "гостя", "гостей")}<br>${esc(p ? p.title : "")}${BQ.occ ? " · " + esc(BQ.occ) : ""}</div>
    <div class="info-card" style="padding:4px 14px 10px">
      ${groups.map(z => `<div class="bq-gh"><span>${esc(z.x.t)}</span><button data-a="msecgo" data-v="${z.i}">изменить</button></div>
        ${z.l.map(({ it, q }) => `<div class="bq-ln"><span>${esc(it.n)} × ${esc(qtyTxt(it, q))}</span><span>${fmt(it.p * q)}</span></div>`).join("")}`).join("")}
      <div class="bq-ln t"><span>Итого</span><span>${fmt(sum)} сум</span></div>
      <div class="bq-hint" style="margin-top:0">${fmt(Math.round(sum / BQ.g))} на гостя${(+BQ.info.servicePct || 0) ? " · обслуживание " + BQ.info.servicePct + "%" : ""}</div></div>
    ${dep && sum < dep ? `<div class="bq-warn">Минимальная сумма заказа за «${esc(p.title)}» - <b>${fmt(dep)}</b>. Заявку можно отправить и так - менеджер подскажет, что добавить.</div>` : ""}
    ${gf.length ? `<div class="bq-gift">Подарок вашей компании - <b>${esc(giftTxt(gf))}</b></div>` : ""}
    <div class="bq-h">Контакты</div>
    <input class="bk-input" id="bq-name" placeholder="Имя" value="${esc(BQ.name)}" style="margin-bottom:8px">
    <input class="bk-input" id="bq-phone" type="tel" placeholder="+998 __ ___ __ __" value="${esc(BQ.phone)}" style="margin-bottom:8px">
    <textarea class="bk-input" id="bq-wish" rows="2" placeholder="Пожелания (необязательно)">${esc(BQ.wish)}</textarea>
    <div class="bq-hint">Расчёт предварительный. Менеджер проверит заявку и пришлёт точный расчёт с депозитом.</div>
    <div class="bq-msg" id="bq-msg">${esc(BQ.err)}</div>
    <button class="bk-submit" data-a="send" ${BQ.sending ? "disabled" : ""}>${BQ.sending ? "Отправляю…" : "Отправить заявку"}</button>`;
}
function placeState(p){
  if (BQ.g > (+p.max || 999)) return "до " + p.max + " " + pl(+p.max, "гостя", "гостей", "гостей");
  if (BQ.g < (+p.min || 0)) return "от " + p.min + " " + pl(+p.min, "гостя", "гостей", "гостей");
  if (BQ.date && BQ.busyDate === BQ.date && BQ.busy.includes(p.id)) return "занят на эту дату";
  if (p.weekendOnly && BQ.date){ const d = dObj(BQ.date).getDay(); if (d !== 5 && d !== 6) return "только пт и сб"; }
  return "";
}
function gifts(sum){
  const d = BQ.date ? dObj(BQ.date) : null, we = d && (d.getDay() === 5 || d.getDay() === 6);
  return ((BQ.info && BQ.info.promos) || []).filter(x => {
    if (x.from && BQ.date && BQ.date < x.from) return false;
    if (x.to && BQ.date && BQ.date > x.to) return false;
    if (x.days === "we" && d && !we) return false;
    if (x.days === "wd" && d && we) return false;
    if (x.type === "guests") return BQ.g >= (+x.at || 0);
    if (x.type === "sum") return (+x.at || 0) === 0 || (sum != null && sum >= +x.at);
    return false; }).map(x => { const q = +x.qty > 0 ? Math.max(1, Math.floor(+x.qty * BQ.g / ((BQ.info && BQ.info.packBase) || 10) + 1e-9)) : 0;
      return x.gift + (q ? " " + q + " " + (x.unit || "шт") : ""); });   // 18.11: подарок умножается по числу гостей
}
const giftTxt = list => list.map(x => String(x).trim().replace(/^./, c => c.toLowerCase())).join(", ");

/* ---------- главная: плашка ---------- */
function paintHome(){
  const slot = document.getElementById("bq-home-slot"); if (!slot) return;
  if (!BQ.info){ slot.innerHTML = ""; return; }
  const pk = (BQ.info.packs || []).slice(0, 3), cls = t => /gold/i.test(t) ? "bq-g" : /plat/i.test(t) ? "bq-p" : /diam/i.test(t) ? "bq-d" : "";
  slot.innerHTML = `<button class="bq-plate" id="bq-plate"><b>Банкет${BQ.info.tester && !BQ.info.open ? `<span class="tst">ТЕСТ</span>` : ""}</b>
    <span>День рождения, корпоратив, Новый год. Соберите банкет за 3 шага - менеджер пришлёт расчёт.</span>
    ${pk.length ? `<div class="pr">${pk.map(k => `<div class="${cls(k.title)}">${esc(k.title)}<em>${fmt(k.price)}</em></div>`).join("")}</div>` : ""}</button>`;
  injectCss();
  document.getElementById("bq-plate").onclick = () => go("banket");
}

/* ---------- раздел ---------- */
function steps(n){ const L = ["Гости и дата", "Зал", "Предложение"];
  return `<div class="bq-stp">${[1,2,3].map(i => `<div class="${i <= n ? "on" : ""}"></div>`).join("")}</div>
    <div class="bq-stl">${L.map((l, i) => i + 1 === n ? `<b>${l}</b>` : `<span>${l}</span>`).join("")}</div>`; }
function render(){
  injectCss();
  const el = sec(); if (!el) return;
  if (!BQ.info){ el.innerHTML = `<div class="info-card">Загружаю…</div>`; return; }
  const sl = document.getElementById("bq-sec"), keep = sl ? sl.scrollLeft : null;
  el.innerHTML = BQ.done ? viewDone() : BQ.step === 1 ? view1() : BQ.step === 2 ? view2() : BQ.step === 4 && window.BQ_MENU ? view4() : BQ.step === 5 && window.BQ_MENU ? view5() : view3();
  const s2 = document.getElementById("bq-sec"); if (s2){ if (keep != null && !BQ.secJump) s2.scrollLeft = keep; else { const on = s2.querySelector(".on"); if (on) s2.scrollLeft = Math.max(0, on.offsetLeft - 60); } BQ.secJump = false; }
  bind();
  if (BQ.video) showVideo(BQ.video);
}
function view1(){
  const today = iso(new Date()), max = iso(new Date(Date.now() + 365 * 864e5));
  const times = []; for (let h = 12; h <= 23; h++) for (const m of ["00", "30"]) times.push(String(h).padStart(2, "0") + ":" + m);
  const occ = (BQ.info.occasions || []).length ? BQ.info.occasions : ["День рождения", "Корпоратив", "Новый год", "Другое"];
  const gf = gifts(null).filter(Boolean);
  const mine = (BQ.info.mine || []).map(m => `<div class="bq-mine"><div class="bq-id" style="margin:0 0 2px">ID ${esc(m.code)}</div>
      ${m.date ? esc(dLab(m.date)) : ""}${m.time ? " · " + esc(m.time) : ""} · ${m.guests} ${pl(m.guests, "гость", "гостя", "гостей")}${m.place ? " · " + esc(m.place) : ""}${m.pack ? " · " + esc(m.pack) : ""}
      <div class="s">${esc(ST[m.status] || m.status)}</div></div>`).join("");
  return `${mine ? `<div class="bq-h" style="margin-top:4px">Мои заявки на банкет</div>${mine}` : ""}
    ${steps(1)}
    <div class="bq-h">Сколько гостей</div>
    <div class="bq-cnt"><button class="bq-q" data-a="g" data-v="-1">-</button><b>${BQ.g}</b><button class="bq-q" data-a="g" data-v="1">+</button></div>
    <div class="bq-h">Когда</div>
    <div class="bq-two"><input class="bk-input" type="date" id="bq-date" min="${today}" max="${max}" value="${esc(BQ.date)}" style="color-scheme:dark">
      <select class="bk-input" id="bq-time">${times.map(t => `<option ${t === BQ.time ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    ${BQ.date ? `<div class="bq-hint">${esc(dLab(BQ.date))}, начало в ${esc(BQ.time)}</div>` : ""}
    <div class="bq-h">Повод</div>
    <div class="bq-chips">${occ.map(o => `<button class="bq-chip ${BQ.occ === o ? "on" : ""}" data-a="occ" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>
    ${gf.length ? `<div class="bq-gift">Вашей компании ${BQ.g} ${pl(BQ.g, "гостя", "гостей", "гостей")} - <b>${esc(giftTxt(gf))}</b> в подарок</div>` : ""}
    <div class="bq-msg" id="bq-msg">${esc(BQ.err)}</div>
    <button class="bk-submit" data-a="next1">Дальше - выбрать зал</button>`;
}
function view2(){
  const list = (BQ.info.places || []).filter(p => !/^новая площадка$/i.test((p.title || "").trim())).map(p => ({ p, why:placeState(p) })).sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0));
  return `${steps(2)}<button class="bq-back" data-a="to" data-v="1">← ${BQ.g} ${pl(BQ.g, "гость", "гостя", "гостей")} · ${esc(dLab(BQ.date))}</button>
    <div class="bq-h" style="margin-top:6px">Где проведём</div>
    <div class="bq-pls">${list.map(({ p, why }) => `<button class="bq-pl ${BQ.place === p.id ? "on" : ""} ${why ? "no" : ""}" data-a="place" data-v="${esc(p.id)}" ${why ? "disabled" : ""}>
      ${(() => { const L = phs(p); return `<div class="im" ${L[0] ? `style="background-image:url('${esc(L[0])}')" data-a="gal" data-v="${esc(p.id)}"` : ""}>${L.length > 1 ? `<span class="nf">${L.length} фото</span><span class="dt">${L.map(() => "<i></i>").join("")}</span>` : ""}${p.video && !why ? `<em data-a="video" data-v="${esc(p.video)}">видео</em>` : ""}</div>`; })()}
      <div class="bd"><b>${esc(p.title)}</b><span>до ${p.max} ${pl(+p.max, "гостя", "гостей", "гостей")}${p.about ? " · " + esc(p.about) : ""}</span>${why ? `<span class="why">${esc(why)}</span>` : ""}</div></button>`).join("")}</div>
    <div class="bq-hint">Столы выбирать не нужно - рассадку сделает менеджер.</div>
    <div class="bq-msg" id="bq-msg">${esc(BQ.err)}</div>
    <button class="bk-submit" data-a="next2">Дальше - предложение</button>`;
}
function view3(){
  const packs = BQ.info.packs || [], k = mult(), base = (BQ.info.packBase || 10), cls = t => /gold/i.test(t) ? "bq-g" : /plat/i.test(t) ? "bq-p" : /diam/i.test(t) ? "bq-d" : "";
  const self = BQ.own === "self", nSel = self && window.BQ_MENU ? selLines().length : 0;
  const pk = K(BQ.pack), sum = pk ? (+pk.price || 0) * BQ.g : nSel ? selSum() : null, gf = gifts(sum);
  const short = x => (x.items || []).slice(0, 7).map(i => i.n).join(", ") + ((x.items || []).length > 7 ? "…" : "");
  return `${steps(3)}<button class="bq-back" data-a="to" data-v="2">← ${esc(P(BQ.place) ? P(BQ.place).title : "зал")} · ${BQ.g} ${pl(BQ.g, "гость", "гостя", "гостей")}</button>
    ${packs.map(x => `<div class="bq-pk ${BQ.pack === x.id ? "on" : ""}" data-a="pack" data-v="${esc(x.id)}">
        <div class="t"><b class="${cls(x.title)}">${esc(x.title)}</b><span>${fmt(x.price)} <small>на гостя</small></span></div>
        ${x.descr ? `<div class="ds">${esc(x.descr)}</div>` : ""}<div class="it">${esc(short(x))}</div>
        <div class="lk" data-a="comp" data-v="${esc(x.id)}">${BQ.open === x.id ? "Скрыть состав" : "Весь состав на " + BQ.g + " " + pl(BQ.g, "гостя", "гостей", "гостей")}</div>
        ${BQ.open === x.id ? `<div class="bq-comp">${(qs => (x.items || []).map((i, n) => ({ i, q:qs[n] })).sort((a, b) => (+a.i.b || 0) - (+b.i.b || 0)).map(({ i, q }) => `<div><span>${esc(i.n)}</span><span>${fmt1(q)} ${esc(i.u || "")}</span></div>`).join(""))(packQtys(x.items || [], BQ.g))}
          <div class="bq-hint">Количество - на ${BQ.g} ${pl(BQ.g, "гостя", "гостей", "гостей")}.</div></div>` : ""}</div>`).join("")}
    <div class="bq-own ${BQ.own ? "on" : ""}"><b>Своё меню</b>
      <div class="ds">${nSel ? "Вы собрали " + nSel + " " + pl(nSel, "позицию", "позиции", "позиций") + " на " + fmt(selSum()) + " сум" : "Выберите блюда сами или оставьте это менеджеру"}</div>
      <div class="bt"><button class="${nSel ? "on" : "go"}" data-a="ownself">${nSel ? "Изменить меню" : "Собрать самому"}<small>${nSel ? "добавить или убрать блюда" : "выбрать блюда из меню"}</small></button>
        <button class="${BQ.own === true ? "on" : ""}" data-a="own">С менеджером<small>позвоним и соберём</small></button></div></div>
    <div class="bq-h">Контакты</div>
    <input class="bk-input" id="bq-name" placeholder="Имя" value="${esc(BQ.name)}" style="margin-bottom:8px">
    <input class="bk-input" id="bq-phone" type="tel" placeholder="+998 __ ___ __ __" value="${esc(BQ.phone)}" style="margin-bottom:8px">
    <textarea class="bk-input" id="bq-wish" rows="2" placeholder="Пожелания (необязательно)">${esc(BQ.wish)}</textarea>
    <div class="bq-sum"><div class="r"><span>${pk ? BQ.g + " × " + fmt(pk.price) : nSel ? "Своё меню · " + nSel + " " + pl(nSel, "позиция", "позиции", "позиций") : BQ.own ? "Своё меню" : "Выберите предложение"}</span><b>${pk || nSel ? fmt(sum) + " сум" : BQ.own ? "расчёт пришлёт менеджер" : ""}</b></div>
      <div class="bq-hint">${(+BQ.info.servicePct || 0) ? "Обслуживание " + BQ.info.servicePct + "%" : "Обслуживание 0%"}${gf.length ? " · " + esc(giftTxt(gf)) + " - в подарок" : ""}. Итог предварительный - точный расчёт пришлёт менеджер.</div></div>
    <div class="bq-msg" id="bq-msg">${esc(BQ.err)}</div>
    <button class="bk-submit" data-a="send" ${BQ.sending ? "disabled" : ""}>${BQ.sending ? "Отправляю…" : "Отправить заявку"}</button>`;
}
function viewDone(){
  const x = BQ.done, pk = K(x.pack), p = P(x.place), sum = pk ? (+pk.price || 0) * x.g : x.sum || null, gf = gifts(sum), tel = (BQ.info.phone || "").replace(/[^\d+]/g, "") || (typeof PHONE_KAR !== "undefined" ? PHONE_KAR : "");
  return `<div class="bq-ok"><div class="ring"></div><b>Заявка отправлена</b><div class="bq-id">ID ${esc(x.code)}</div>
      <p>Менеджер свяжется с вами и пришлёт расчёт сюда, в бот. Дата закрепляется после депозита ${BQ.info.depositPct || 10}%.</p></div>
    <div class="info-card" style="padding:6px 14px">
      ${x.occ ? `<div class="bq-kv"><span>Повод</span><b>${esc(x.occ)}</b></div>` : ""}
      <div class="bq-kv"><span>Когда</span><b>${esc(dLab(x.date))} · ${esc(x.time)}</b></div>
      <div class="bq-kv"><span>Гостей</span><b>${x.g}</b></div>
      <div class="bq-kv"><span>Где</span><b>${esc(p ? p.title : "")}</b></div>
      <div class="bq-kv"><span>Предложение</span><b>${pk ? esc(pk.title) + " · ≈ " + fmt(sum) : x.n ? "своё меню · " + x.n + " " + pl(x.n, "позиция", "позиции", "позиций") + " · ≈ " + fmt(sum) : "своё меню"}</b></div>
      ${gf.length ? `<div class="bq-kv"><span>Подарки</span><b>${esc(giftTxt(gf))}</b></div>` : ""}</div>
    ${tel ? `<a class="bk-submit ghost" style="display:block;text-align:center;text-decoration:none" href="tel:${esc(tel)}">Позвонить: ${esc(BQ.info.phone || tel)}</a>` : ""}
    <button class="bk-submit ghost" data-a="again">Новая заявка</button>`;
}
const phs = p => ((p && Array.isArray(p.photos) && p.photos.length) ? p.photos : (p && p.photo ? [p.photo] : [])).filter(Boolean);
function showGal(id, i){
  const p = P(id), L = phs(p); if (!L.length) return;
  let k = i || 0;
  const d = document.createElement("div"); d.className = "bq-gal";
  const paint = () => { k = (k % L.length + L.length) % L.length;
    d.innerHTML = `<div class="hd"><div>${esc(p.title)}</div><span>${k + 1} / ${L.length}</span></div>
      <div class="ph"><img src="${esc(L[k])}" alt="">${L.length > 1 ? `<button class="ar l" data-g="-1">‹</button><button class="ar r" data-g="1">›</button>` : ""}</div>
      ${L.length > 1 ? `<div class="dt">${L.map((_, j) => `<i class="${j === k ? "on" : ""}"></i>`).join("")}</div><div class="th">${L.map((u, j) => `<button class="${j === k ? "on" : ""}" data-t="${j}" style="background-image:url('${esc(u)}')"></button>`).join("")}</div>` : ""}
      <div class="bt">${placeState(p) ? "" : `<button class="bk-submit" data-s="1">Выбрать этот зал</button>`}<button class="bk-submit ghost" data-c="1">Закрыть</button></div>`;
    d.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { k += +b.dataset.g; paint(); });
    d.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { k = +b.dataset.t; paint(); });
    const s = d.querySelector("[data-s]"); if (s) s.onclick = () => { d.remove(); BQ.place = id; BQ.err = ""; haptic(); render(); };
    d.querySelector("[data-c]").onclick = () => d.remove(); };
  let x0 = null;
  d.addEventListener("touchstart", e => { if (e.target.closest(".ph")) x0 = e.touches[0].clientX; }, { passive:true });
  d.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40 && L.length > 1){ k += dx < 0 ? 1 : -1; paint(); } }, { passive:true });
  paint(); document.body.appendChild(d);
}
function showVideo(url){
  BQ.video = null;
  const d = document.createElement("div"); d.className = "bq-vid";
  d.innerHTML = `<video src="${esc(url)}" controls autoplay playsinline></video><button class="bk-submit ghost" style="max-width:260px">Закрыть</button>`;
  d.querySelector("button").onclick = () => d.remove(); document.body.appendChild(d);
}
function saveInputs(){
  const v = id => { const e = document.getElementById(id); return e ? e.value : null; };
  if (v("bq-date") != null) BQ.date = v("bq-date");
  if (v("bq-time") != null) BQ.time = v("bq-time");
  if (v("bq-name") != null) BQ.name = v("bq-name");
  if (v("bq-phone") != null) BQ.phone = v("bq-phone");
  if (v("bq-wish") != null) BQ.wish = v("bq-wish");
}
async function loadBusy(){
  if (!BQ.date || BQ.busyDate === BQ.date) return;
  const d = await rpc("busy", { date:BQ.date });
  if (d && d.ok){ BQ.busy = d.busy || []; BQ.busyDate = BQ.date; }
}
function bind(){
  const el = sec();
  const dt = document.getElementById("bq-date"); if (dt) dt.onchange = () => { saveInputs(); BQ.err = ""; render(); loadBusy(); };
  const tm = document.getElementById("bq-time"); if (tm) tm.onchange = () => { saveInputs(); render(); };
  el.querySelectorAll("[data-a]").forEach(b => b.onclick = async ev => {
    const a = b.dataset.a, v = b.dataset.v;
    if (a === "video"){ ev.stopPropagation(); showVideo(v); return; }
    if (a === "gal"){ ev.stopPropagation(); saveInputs(); showGal(v, 0); return; }
    if (a === "comp"){ ev.stopPropagation(); saveInputs(); BQ.open = BQ.open === v ? null : v; render(); return; }
    saveInputs(); BQ.err = "";
    if (a === "g"){ BQ.g = Math.max(1, Math.min(300, BQ.g + (+v) * (BQ.g >= 20 && Math.abs(+v) === 1 ? 1 : 1))); haptic(); }
    else if (a === "occ"){ BQ.occ = BQ.occ === v ? "" : v; haptic(); }
    else if (a === "to"){ BQ.step = +v; window.scrollTo(0, 0); }
    else if (a === "next1"){
      if (!BQ.date){ BQ.err = "Выберите дату"; render(); return; }
      if (BQ.date < iso(new Date())){ BQ.err = "Эта дата уже прошла"; render(); return; }
      await loadBusy();
      const cur = P(BQ.place); if (cur && placeState(cur)) BQ.place = "";
      BQ.step = 2; window.scrollTo(0, 0);
    }
    else if (a === "place"){ BQ.place = v; haptic(); }
    else if (a === "next2"){ if (!BQ.place){ BQ.err = "Выберите зал или кабинку"; render(); return; } BQ.step = 3; window.scrollTo(0, 0); }
    else if (a === "pack"){ BQ.pack = v; BQ.own = false; haptic(); }
    else if (a === "own"){ BQ.own = true; BQ.pack = ""; haptic(); }
    else if (a === "ownself"){ haptic(); if (!(await loadMenu())){ BQ.err = "Меню не загрузилось - проверьте интернет и попробуйте ещё раз"; render(); return; }
      BQ.own = "self"; BQ.pack = ""; BQ.step = 4; BQ.secJump = true; window.scrollTo(0, 0); }
    else if (a === "msec" || a === "msecgo"){ BQ.msec = +v; BQ.step = 4; BQ.secJump = true; window.scrollTo(0, 0); }
    else if (a === "dq"){ const it = catalog().by[v]; if (it){ const st = stepOf(it), q = Math.max(0, Math.min(300, (+BQ.sel[v] || 0) + (+b.dataset.d) * st)); if (q) BQ.sel[v] = q; else delete BQ.sel[v]; haptic(); } }
    else if (a === "review"){ if (!selLines().length) return; BQ.step = 5; window.scrollTo(0, 0); }
    else if (a === "send"){ await send(); return; }
    else if (a === "again"){ BQ.done = null; BQ.step = 1; BQ.place = ""; BQ.pack = ""; BQ.own = false; BQ.wish = ""; BQ.sel = {}; BQ.msec = 0; window.scrollTo(0, 0); }
    render();
  });
}
async function send(){
  if (BQ.sending) return;
  if (!BQ.pack && !BQ.own){ BQ.err = "Выберите предложение или «Своё меню»"; render(); return; }
  if (BQ.own === "self" && !BQ.pack && !(window.BQ_MENU && selLines().length)){ BQ.err = "Вы ещё не выбрали блюда - нажмите «Собрать самому» или «С менеджером»"; render(); return; }
  if ((BQ.name || "").trim().length < 2){ BQ.err = "Укажите имя"; render(); return; }
  if ((BQ.phone || "").replace(/\D/g, "").length < 9){ BQ.err = "Укажите телефон"; render(); return; }
  BQ.sending = true; render();
  const self = BQ.own === "self" && !BQ.pack && window.BQ_MENU, L = self ? selLines() : [], extra = {}; L.forEach(l => extra[l.it.ref] = l.q);
  const sumOwn = self ? selSum() : 0;
  const d = await rpc("request", Object.assign({ name:BQ.name, phone:BQ.phone, date:BQ.date, time:BQ.time, guests:String(BQ.g), place:BQ.place, occ:BQ.occ, pack:BQ.pack || "", wish:BQ.wish }, L.length ? { extra } : {}));
  BQ.sending = false;
  if (!d || !d.ok){ BQ.err = (d && d.error) || "Не получилось отправить - попробуйте ещё раз"; render(); return; }
  haptic("success");
  BQ.done = { code:d.code, pack:BQ.pack, place:BQ.place, g:BQ.g, date:BQ.date, time:BQ.time, occ:BQ.occ, n:L.length, sum:sumOwn };
  BQ.sel = {}; BQ.msec = 0;
  render(); window.scrollTo(0, 0);
  const i = await rpc("info"); if (i && i.visible) BQ.info = i;
}
async function init(){
  const i = await rpc("info");
  if (!i || !i.visible){ window.BQ_VISIBLE = false; return; }
  BQ.info = i; window.BQ_VISIBLE = true;
  BQ.name = (i.me && i.me.name) || ""; BQ.phone = (i.me && i.me.phone) || "";
  paintHome();
  let sp = null; try{ sp = Telegram.WebApp.initDataUnsafe.start_param || null; }catch(_){}
  const q = new URLSearchParams(location.search);
  if (sp === "banket" || q.get("tab") === "banket") go("banket");
}
window.BqInit = init;
window.BqPaintHome = paintHome;
window.BqOpen = () => { if (!BQ.info){ init().then(render); } render(); };
})();
