/* SPLETNI · вкладка «Песни» в гостевом приложении (guest.html)
   Сборка 3 · 07.10.2026 (тестовый режим, голосование на экране)
   - каталог AST-250 (pesni/songs.json), поиск, топ недели, новинки
   - избранное и «Я пел в SPLETNI»
   - «Мой стол»: заказ на свой стол, когда хостес отметила «гость сел»;
     примерное время, что поют в зале, лайки («Голос вечера»), друзья за столом
   Вход: подпись Telegram -> Edge Function songs (login) -> токен сессии;
   данные: rpc song_call(токен, действие, данные).
   Использует из guest.html: SB_URL, SB_ANON, go(), CUR. */
(function(){
"use strict";
const FN_URL = SB_URL + "/functions/v1/songs";
const RPC_URL = SB_URL + "/rest/v1/rpc/song_call";
const PS = {
  token: null, me: null, cat: null, catErr: "", tab: "cat", fmode: "fav", mode: "all", q: "",
  limit: 60, poll: null, busy: false, err: "", startParam: null, joinedFromLink: false,
  favSet: new Set(), lastMe: 0
};
const SEC = () => document.getElementById("sec-songs");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) ? b : c; };
const mmss = d => Math.floor(d / 60) + ":" + String(d % 60).padStart(2, "0");
const clockIn = sec => { const d = new Date(Date.now() + sec * 1000); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const minTxt = sec => "~" + Math.max(1, Math.round(sec / 60)) + " мин";
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.3-1.2C6 14.9 3 12.2 3 8.8 3 6.1 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.1 21 8.8c0 3.4-3 6.1-7.7 10.3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const ERR = {
  no_table: "Сегодня в Большом зале нет брони на ваш номер",
  not_seated: "Заказ откроется, когда хостес отметит, что вы сели",
  closed: "Звукооператор временно не принимает заявки",
  limit: "Лимит стола: столько песен уже ждут очереди",
  dup: "Эта песня уже в очереди вашего стола",
  own_table: "За свой стол лайк не ставится",
  not_owner: "Это может сделать только тот, на кого бронь",
  bad_phone: "Введите 9 цифр номера, например 93 555 56 78",
  own_phone: "Это ваш номер - вы уже за столом",
  members_limit: "За столом уже максимум гостей",
  bad_code: "Код не найден или уже не действует",
  auth: "Сессия устарела - откройте приложение заново",
  phone_not_verified: "Telegram не передал номер. Обновите Telegram и попробуйте ещё раз",
  bad_init_data: "Откройте приложение через бота SPLETNI",
  no_tg: "Откройте приложение через бота SPLETNI в Telegram",
  test_mode: "Песни пока работают в тестовом режиме"
};
const errText = e => ERR[e] || ("Ошибка: " + e);

/* ---------- стили (в цветах guest.html) ---------- */
const CSS = `
#sec-songs{padding:14px 14px 96px}
.sg-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:2px 0 12px}
.sg-h h2{margin:0;font-size:22px;font-weight:800}
.sg-h span{font-size:12px;color:var(--muted)}
.sg-tabs{display:flex;gap:6px;margin-bottom:12px}
.sg-tabs button{flex:1;position:relative;padding:10px 6px;border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:11px;font-size:13px;font-weight:700}
.sg-tabs button.on{border-color:var(--emerald);color:var(--emerald);background:rgba(31,191,122,.10)}
.sg-badge{position:absolute;top:-6px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--gold);color:#111;font-size:11px;font-weight:800;line-height:18px}
.sg-search{position:relative;margin-bottom:10px}
.sg-search input{width:100%;height:46px;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:12px;padding:0 14px;font-size:15px;outline:none}
.sg-search input:focus{border-color:var(--emerald)}
.sg-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.sg-chips button{padding:7px 12px;border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:18px;font-size:12.5px;font-weight:700}
.sg-chips button.on{border-color:var(--emerald);color:var(--emerald)}
.sg-note{font-size:13px;color:var(--muted);line-height:1.45;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel);margin-bottom:10px}
.sg-note b{color:var(--text)}
.sg-note.ok{border-color:rgba(31,191,122,.45);background:rgba(31,191,122,.07)}
.sg-note.warn{border-color:rgba(201,161,74,.5);background:rgba(201,161,74,.07)}
.sg-row{display:grid;grid-template-columns:58px minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:9px 0;border-top:1px solid var(--line)}
.sg-row:first-child{border-top:0}
.sg-num{font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums;font-size:15px}
.sg-t{min-width:0}
.sg-t b{display:block;font-size:14.5px;font-weight:700;line-height:1.25;overflow-wrap:anywhere}
.sg-t span{display:block;font-size:12.5px;color:var(--muted);margin-top:1px}
.sg-t .who{font-size:11.5px}
.sg-ic{width:38px;height:38px;border:0;background:transparent;color:var(--muted);display:grid;place-items:center;border-radius:10px}
.sg-ic svg{width:21px;height:21px;fill:none}
.sg-ic.on{color:var(--gold)}.sg-ic.on svg{fill:currentColor}
.sg-add{height:36px;padding:0 12px;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:10px;font-size:13px;font-weight:700;white-space:nowrap}
.sg-add.in{border-color:var(--emerald);color:var(--emerald);background:rgba(31,191,122,.10)}
.sg-add[disabled]:not(.in){opacity:.35}
.sg-x{width:34px;height:34px;border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:9px;font-size:18px;line-height:1}
.sg-more{display:block;width:100%;margin-top:10px;padding:12px;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:12px;font-weight:700}
.sg-empty{text-align:center;color:var(--muted);padding:26px 10px;font-size:14px;line-height:1.5}
.sg-empty b{display:block;color:var(--text);font-size:15px;margin-bottom:4px}
.sg-sec{display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:18px 0 6px}
.sg-sec span{letter-spacing:0;text-transform:none;font-weight:600}
.sg-card{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:14px}
.sg-seat{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;margin-bottom:10px}
.sg-pill{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.sg-pill.on{border-color:var(--emerald);color:var(--emerald);background:rgba(31,191,122,.10)}
.sg-pill.wait{border-color:var(--gold);color:var(--gold)}
.sg-hero{border:1px solid rgba(31,191,122,.45);background:rgba(31,191,122,.07);border-radius:14px;padding:13px 15px;margin-bottom:6px}
.sg-hero span{display:block;font-size:12.5px;color:var(--muted)}
.sg-hero b{display:block;font-size:30px;font-weight:900;line-height:1.15;margin:2px 0}
.sg-hero small{font-size:12.5px;color:var(--muted)}
.sg-hero.idle{border-color:var(--line);background:var(--panel)}
.sg-eta{display:inline-block;margin-top:4px;font-size:12px;font-weight:700;color:var(--muted);border:1px solid var(--line);border-radius:10px;padding:2px 8px}
.sg-eta.soon{color:var(--emerald);border-color:var(--emerald)}
.sg-tag{display:inline-block;margin:4px 0 0 0;font-size:11px;font-weight:800;color:var(--gold);border:1px solid var(--gold);border-radius:5px;padding:0 6px}
.sg-hall{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
.sg-hall:first-child{border-top:0}
.sg-hp{font-size:12.5px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.sg-hall.now .sg-hp{color:var(--emerald);font-weight:800;font-size:11.5px}
.sg-hall.mine .sg-t b{color:var(--emerald)}
.sg-like{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:56px;height:34px;padding:0 10px;border:1px solid var(--line);border-radius:17px;background:transparent;color:var(--muted);font-size:13px;font-weight:700}
.sg-like svg{width:16px;height:16px;fill:none}
.sg-like.on{border-color:#ff6f9a;color:#ff8fb0;background:rgba(255,111,154,.12)}
.sg-like.on svg{fill:currentColor}
.sg-like.mine{border-color:transparent}
.sg-mem{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:9px 0;border-top:1px solid var(--line)}
.sg-mem:first-child{border-top:0}
.sg-btn{display:block;width:100%;padding:13px;border:1px solid var(--emerald);background:rgba(31,191,122,.12);color:var(--emerald);border-radius:12px;font-size:15px;font-weight:800;margin-top:10px}
.sg-btn.ghost{border-color:var(--line);background:transparent;color:var(--text)}
.sg-btn[disabled]{opacity:.5}
.sg-in{display:flex;gap:8px;margin-top:8px}
.sg-in input{flex:1;min-width:0;height:44px;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:11px;padding:0 12px;font-size:15px;outline:none}
.sg-in input:focus{border-color:var(--emerald)}
.sg-in button{height:44px;padding:0 14px;border:1px solid var(--emerald);background:rgba(31,191,122,.12);color:var(--emerald);border-radius:11px;font-weight:800;white-space:nowrap}
.sg-msg{font-size:12.5px;margin-top:6px;color:#e2655c}
.sg-msg.ok{color:var(--emerald)}
.sg-day{font-size:12px;font-weight:800;color:var(--muted);margin:14px 0 2px}
.sg-day span{font-weight:600}
.sg-code{font-size:26px;font-weight:900;letter-spacing:.2em;text-align:center;padding:8px;border:1px dashed var(--gold);border-radius:12px;color:var(--gold);margin:8px 0}
.sg-poll{border:1px solid rgba(255,111,154,.55);background:rgba(255,111,154,.07);border-radius:14px;padding:12px 14px;margin-bottom:12px}
.sg-poll h3{margin:0;font-size:16px;font-weight:800}
.sg-poll .sub{font-size:12.5px;color:var(--muted);margin:2px 0 4px}
.sg-poll .sg-hall{border-top-color:rgba(255,111,154,.2)}
.sg-pb{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin:0 0 12px;padding:10px 12px;border:1px solid rgba(255,111,154,.55);background:rgba(255,111,154,.08);border-radius:12px;color:var(--text);font-size:13.5px;font-weight:700;text-align:left}
.sg-pb span{color:#ff8fb0;white-space:nowrap}
#sg-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);max-width:min(92vw,520px);z-index:90;background:#eef1f4;color:#0d0f12;padding:10px 16px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.4);display:none;text-align:center}
`;

function injectCss(){
  if (document.getElementById("sg-css")) return;
  const st = document.createElement("style"); st.id = "sg-css"; st.textContent = CSS; document.head.appendChild(st);
  const t = document.createElement("div"); t.id = "sg-toast"; document.body.appendChild(t);
}
let toastTimer = null;
function toast(msg){
  const t = document.getElementById("sg-toast"); if (!t) return;
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = "none"; }, 3200);
}
function haptic(kind){ try{ Telegram.WebApp.HapticFeedback.notificationOccurred(kind || "success"); }catch(_){} }

/* ---------- связь с сервером ---------- */
async function fn(body){
  try{
    const r = await fetch(FN_URL, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_ANON, Authorization: "Bearer " + SB_ANON },
      body: JSON.stringify(body) });
    let d = {}; try{ d = await r.json(); }catch(_){}
    if (!r.ok && !d.error) d.error = "http_" + r.status;
    return d;
  }catch(e){ return { error: "network" }; }
}
async function login(){
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = tg && tg.initData;
  if (!initData){ PS.err = "no_tg"; return false; }
  const d = await fn({ action: "login", initData, app: "guest" });
  if (!d.token){ PS.err = d.test_mode ? "test_mode" : (d.error || "login"); return false; }
  PS.token = d.token; PS.err = "";
  try{ sessionStorage.setItem("sg_token", d.token); }catch(_){}
  PS.startParam = d.start_param || (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || null;
  return true;
}
async function call(action, args, retry){
  if (!PS.token){ const ok = await login(); if (!ok) return { error: PS.err }; }
  let d;
  try{
    const r = await fetch(RPC_URL, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_ANON, Authorization: "Bearer " + SB_ANON },
      body: JSON.stringify({ p_token: PS.token, p_action: action, p_args: args || {} }) });
    d = await r.json();
    if (!r.ok) d = { error: (d && d.message) || ("http_" + r.status) };
  }catch(e){ d = { error: "network" }; }
  if (d && d.error === "auth" && !retry){
    PS.token = null; try{ sessionStorage.removeItem("sg_token"); }catch(_){}
    return call(action, args, true);
  }
  if (d && d.flush) fn({ action: "flush", token: PS.token });
  return d || { error: "empty" };
}
async function refresh(){
  const d = await call("me");
  if (d && !d.error){
    PS.me = d; PS.lastMe = Date.now();
    PS.favSet = new Set((d.favs || []).map(f => f[0]));
  } else if (d && d.error) PS.err = d.error;
  render();
}

/* ---------- каталог ---------- */
const LAT = [["shch","щ"],["sch","щ"],["yo","ё"],["zh","ж"],["kh","х"],["ts","ц"],["ch","ч"],["sh","ш"],["yu","ю"],["ya","я"],["ye","е"],
  ["a","а"],["b","б"],["v","в"],["w","в"],["g","г"],["d","д"],["e","е"],["z","з"],["i","и"],["y","й"],["k","к"],["l","л"],["m","м"],["n","н"],
  ["o","о"],["p","п"],["r","р"],["s","с"],["t","т"],["u","у"],["f","ф"],["h","х"],["c","к"],["q","к"],["x","кс"],["j","ж"]];
const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function translit(s){ let out = "", i = 0; while (i < s.length){ let hit = null; for (const [l, c] of LAT){ if (s.startsWith(l, i)){ hit = [l, c]; break; } } if (hit){ out += hit[1]; i += hit[0].length; } else { out += s[i]; i++; } } return out.replace(/ё/g, "е"); }
async function loadCat(){
  if (PS.cat || PS.catLoading) return;
  PS.catLoading = true;
  try{
    const r = await fetch("pesni/songs.json", { cache: "force-cache" });
    const j = await r.json();
    const s = j.s, N = s.length / 5, A = j.a;
    const cat = { N, n: new Int32Array(N), t: new Array(N), a: new Int32Array(N), d: new Int16Array(N), dt: new Int32Array(N), A, hay: new Array(N), v: j.v };
    for (let i = 0, k = 0; i < N; i++, k += 5){
      cat.n[i] = s[k]; cat.t[i] = s[k + 1]; cat.a[i] = s[k + 2]; cat.d[i] = s[k + 3]; cat.dt[i] = s[k + 4];
      cat.hay[i] = norm(s[k + 1] + " " + A[s[k + 2]]) + " " + s[k];
    }
    // новинки - последние три месяца каталога
    const months = [...new Set(Array.from(cat.dt))].sort((x, y) => y - x).slice(0, 3);
    cat.newMonths = months;
    PS.cat = cat; PS.catErr = "";
  }catch(e){ PS.catErr = "Каталог не загрузился - проверьте интернет"; }
  PS.catLoading = false;
  if (PS.tab === "cat") renderList();
}
const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
function searchCat(){
  const c = PS.cat; if (!c) return [];
  const q = norm(PS.q);
  const out = [];
  if (!q){
    if (PS.mode === "top") return [];
    if (PS.mode.startsWith("m")){ const m = +PS.mode.slice(1); for (let i = 0; i < c.N; i++) if (c.dt[i] === m) out.push(i); return out; }
    return [];
  }
  const toks = q.split(" "), toks2 = toks.map(translit);
  const alt = toks2.join(" ") !== toks.join(" ");
  for (let i = 0; i < c.N && out.length < 600; i++){
    const h = c.hay[i];
    if (toks.every(t => h.includes(t)) || (alt && toks2.every(t => h.includes(t)))) out.push(i);
  }
  return out;
}

/* ---------- состояние стола ---------- */
const table = () => PS.me && PS.me.table;
const canOrder = () => !!(table() && table().can_order);
function inMine(n){ return !!(PS.me && (PS.me.mine || []).some(x => x.n === n && x.status === "queued")); }
function songRow(n, t, a, d, extra){
  const fav = PS.favSet.has(n);
  const tb = table();
  let add = "";
  if (tb && tb.status === "seated"){
    const full = (PS.me.mine || []).filter(x => x.status === "queued").length >= tb.limit;
    add = inMine(n) ? '<button type="button" class="sg-add in" disabled>На столе</button>'
      : '<button type="button" class="sg-add" data-add="' + n + '"' + (!canOrder() || full ? " disabled" : "") + ">На стол</button>";
  }
  return '<div class="sg-row"><span class="sg-num">' + n + '</span><div class="sg-t"><b>' + esc(t) + '</b><span>' + esc(a) + (d ? " · " + mmss(d) : "") + (extra || "") + '</span></div>' +
    '<button type="button" class="sg-ic' + (fav ? " on" : "") + '" data-fav="' + n + '" aria-label="' + (fav ? "Убрать из избранного" : "В избранное") + '">' + STAR + '</button>' + (add || "<span></span>") + "</div>";
}
const SONG_CACHE = new Map();
function songData(n){
  if (SONG_CACHE.has(n)) return SONG_CACHE.get(n);
  const c = PS.cat; if (!c) return null;
  for (let i = 0; i < c.N; i++) if (c.n[i] === n){ const v = { n, t: c.t[i], a: c.A[c.a[i]], d: c.d[i] }; SONG_CACHE.set(n, v); return v; }
  return null;
}

/* ---------- экраны ---------- */
function orderNote(){
  const tb = table();
  if (!PS.me) return "";
  if (!PS.me.reg && !tb) return '<div class="sg-note">Чтобы заказывать песни на свой стол, откройте <b>«Мой стол»</b> и поделитесь номером - тем, на который бронь.</div>';
  if (!tb) return "";
  if (tb.status !== "seated") return '<div class="sg-note warn">Стол ' + tb.table_no + ': заказ откроется, когда хостес отметит, что вы сели. Пока можно собрать избранное.</div>';
  if (!PS.me.open) return '<div class="sg-note warn">Звукооператор временно не принимает заявки.</div>';
  const q = (PS.me.mine || []).filter(x => x.status === "queued").length;
  return '<div class="sg-note ok">Заказ на <b>стол ' + tb.table_no + '</b>: в очереди ' + q + " из " + tb.limit + ".</div>";
}
function scrCat(){
  const c = PS.cat;
  const chips = ['<button type="button" class="' + (PS.mode === "all" ? "on" : "") + '" data-mode="all">Поиск</button>',
                 '<button type="button" class="' + (PS.mode === "top" ? "on" : "") + '" data-mode="top">Топ SPLETNI за неделю</button>']
    .concat((c && c.newMonths || []).map(m => '<button type="button" class="' + (PS.mode === "m" + m ? "on" : "") + '" data-mode="m' + m + '">Новинки · ' + MONTHS[(m % 100) - 1] + "</button>"));
  return '<div class="sg-search"><input id="sg-q" type="search" placeholder="Песня, исполнитель или номер" autocomplete="off" value="' + esc(PS.q) + '" aria-label="Поиск песни"></div>' +
    '<div class="sg-chips">' + chips.join("") + "</div>" + orderNote() + '<div id="sg-list"></div>';
}
function listHtml(){
  if (PS.catErr) return '<div class="sg-empty"><b>' + esc(PS.catErr) + "</b></div>";
  if (PS.mode === "top"){
    const top = (PS.me && PS.me.top) || [];
    if (!top.length) return '<div class="sg-empty"><b>Топ появится после первых вечеров</b>Здесь самые популярные песни зала за 7 дней</div>';
    return top.map((x, i) => songRow(x[0], x[1], x[2], x[3], ' · спели ' + x[4] + " " + plural(x[4], "раз", "раза", "раз"))).join("");
  }
  if (!PS.cat) return '<div class="sg-empty"><b>Загружаем каталог…</b>63 000 песен AST-250</div>';
  const res = searchCat();
  if (!PS.q.trim() && PS.mode === "all") return '<div class="sg-empty"><b>63 000+ песен с номерами AST-250</b>Начните вводить название, исполнителя или номер. Можно латиницей.</div>';
  if (!res.length) return '<div class="sg-empty"><b>Ничего не нашлось</b>Попробуйте иначе: часть названия или фамилию исполнителя</div>';
  const c = PS.cat;
  let h = res.slice(0, PS.limit).map(i => songRow(c.n[i], c.t[i], c.A[c.a[i]], c.d[i])).join("");
  if (res.length > PS.limit) h += '<button type="button" class="sg-more" data-more="1">Показать ещё (' + (res.length - PS.limit) + ")</button>";
  return h;
}
function renderList(){ const el = document.getElementById("sg-list"); if (el) el.innerHTML = listHtml(); }

function scrFav(){
  const me = PS.me || {};
  let h = '<div class="sg-chips"><button type="button" class="' + (PS.fmode === "fav" ? "on" : "") + '" data-fm="fav">Избранное (' + (me.favs || []).length + ')</button><button type="button" class="' + (PS.fmode === "hist" ? "on" : "") + '" data-fm="hist">Я пел в SPLETNI</button></div>';
  if (PS.fmode === "fav"){
    h += orderNote();
    h += (me.favs || []).length ? (me.favs.map(f => songRow(f[0], f[1], f[2], f[3])).join("")) : '<div class="sg-empty"><b>Пока пусто</b>Отмечайте песни звёздочкой в каталоге - соберите список дома, а в зале заказывайте в одно касание</div>';
  } else {
    const hist = me.history || [];
    if (!hist.length) h += '<div class="sg-empty"><b>Здесь будут спетые песни</b>' + (me.reg ? "Всё, что вы спели в SPLETNI, сохранится тут" : "Поделитесь номером во вкладке «Мой стол» - и мы покажем песни ваших прошлых визитов") + "</div>";
    hist.forEach(v => {
      const dt = new Date(v.date + "T12:00:00");
      h += '<div class="sg-day">' + dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) + " <span>· стол " + v.table_no + "</span></div>";
      h += v.songs.map(x => songRow(x[0], x[1], x[2], x[3])).join("");
    });
  }
  return h;
}
function likeBtn(x){
  if (x.mine) return '<span class="sg-like mine" aria-label="' + x.likes + ' лайков вашему столу">' + HEART + "<span>" + x.likes + "</span></span>";
  return '<button type="button" class="sg-like' + (x.liked ? " on" : "") + '" data-like="' + x.id + '" aria-pressed="' + !!x.liked + '" aria-label="Лайк: ' + esc(x.t) + '">' + HEART + "<span>" + x.likes + "</span></button>";
}
function pollBlock(){
  const pl = PS.me && PS.me.poll; if (!pl) return "";
  const tb = table(), my = tb ? tb.booking_id : null;
  return '<div class="sg-poll"><h3>Голосование: ' + esc(pl.title) + '</h3><div class="sub">Поставьте лайк лучшему исполнению - результаты прямо сейчас на экране зала' + (pl.left ? " · осталось " + pl.left + " сек" : "") + "</div>" +
    (pl.candidates || []).map(c => { const x = Object.assign({}, c, { mine: my != null && c.booking_id === my }); return '<div class="sg-hall' + (x.mine ? " mine" : "") + '"><span class="sg-hp">стол ' + x.table_no + '</span><div class="sg-t"><b>' + esc(x.t) + "</b><span>" + esc(x.a) + "</span></div>" + (tb ? likeBtn(x) : '<span class="sg-like mine">' + HEART + "<span>" + x.likes + "</span></span>") + "</div>"; }).join("") +
    (tb ? "" : '<div class="sub" style="margin-top:6px">Голосуют гости за столами Большого зала - поделитесь номером в «Мой стол».</div>') + "</div>";
}
function pollBanner(){
  const pl = PS.me && PS.me.poll; if (!pl || PS.tab === "table") return "";
  return '<button type="button" class="sg-pb" data-tab="table">Идёт голосование: ' + esc(pl.title) + "<span>голосовать →</span></button>";
}
function scrTable(){
  const me = PS.me;
  if (!me) return '<div class="sg-empty"><b>Загрузка…</b></div>';
  const tb = me.table;
  let h = pollBlock();
  if (!me.reg && !tb){
    h += '<div class="sg-card"><div style="font-weight:800;font-size:16px;margin-bottom:6px">Заказ песен на свой стол</div>' +
      '<div style="color:var(--muted);font-size:13.5px;line-height:1.5">Поделитесь номером Telegram - мы найдём вашу бронь в Большом зале. Когда хостес отметит, что вы сели, сможете ставить песни в очередь, видеть, когда ваш черёд, и звать друзей за стол.</div>' +
      '<button type="button" class="sg-btn" id="sg-share">Поделиться номером</button><div id="sg-share-msg"></div></div>';
    h += '<div class="sg-sec">Есть код стола от друга?</div><div class="sg-in"><input id="sg-code" maxlength="8" placeholder="Например K7Q2MX" autocomplete="off" aria-label="Код стола"><button type="button" id="sg-join">Войти</button></div><div id="sg-join-msg"></div>';
    return h;
  }
  if (!tb){
    h += '<div class="sg-card"><div style="font-weight:800">На сегодня брони в Большом зале не нашли</div><div style="color:var(--muted);font-size:13.5px;margin-top:4px;line-height:1.5">Ищем по номеру ' + esc(me.phone || "") + '. Если бронь на другой номер - попросите того, на кого бронь, добавить вас за стол, или введите его код.</div></div>';
    h += '<div class="sg-sec">Код стола от друга</div><div class="sg-in"><input id="sg-code" maxlength="8" placeholder="Например K7Q2MX" autocomplete="off" aria-label="Код стола"><button type="button" id="sg-join">Войти</button></div><div id="sg-join-msg"></div>';
    return h + hallBlock();
  }
  const mine = me.mine || [];
  const queued = mine.filter(x => x.status === "queued");
  const playingMine = mine.find(x => x.status === "playing");
  h += '<div class="sg-seat"><span>Стол ' + tb.table_no + " · Большой зал</span>" +
    (tb.status === "seated" ? '<span class="sg-pill on">Вы за столом</span>' : '<span class="sg-pill wait">Ожидаем вас</span>') + "</div>";
  if (tb.status !== "seated"){
    h += '<div class="sg-note warn">Когда хостес отметит, что вы сели, здесь откроется заказ песен на стол. Номер в брони совпадает с вашим Telegram - больше ничего делать не нужно.</div>';
  } else if (playingMine){
    h += '<div class="sg-hero"><span>Ваша песня</span><b>играет сейчас</b><small>' + esc(playingMine.t) + " - " + esc(playingMine.a) + "</small></div>";
  } else if (queued.length){
    const f = queued[0];
    h += '<div class="sg-hero"><span>Ваша песня примерно через</span><b>' + minTxt(f.eta || 0) + "</b><small>около " + clockIn(f.eta || 0) + " · " + (f.idx === 0 ? "следующая после текущей" : "перед вами " + f.idx + " " + plural(f.idx, "песня", "песни", "песен")) + "</small></div>";
  } else {
    const ql = (me.hall.queue || []).length;
    h += '<div class="sg-hero idle"><span>В очереди зала</span><b>' + ql + " " + plural(ql, "песня", "песни", "песен") + "</b><small>Выберите песню в каталоге или избранном - кнопка «На стол»</small></div>";
  }
  if (!me.open && tb.status === "seated") h += '<div class="sg-note warn">Звукооператор временно не принимает заявки.</div>';
  h += '<div class="sg-sec">Ваши песни <span>' + queued.length + " из " + tb.limit + "</span></div>";
  h += queued.length ? queued.map(x => {
    const soon = x.idx < 2;
    return '<div class="sg-row"><span class="sg-num">' + x.n + '</span><div class="sg-t"><b>' + esc(x.t) + "</b><span>" + esc(x.a) + '</span><span class="who">заказал(а) ' + esc(x.by || "") + "</span>" +
      '<span class="sg-eta' + (soon ? " soon" : "") + '">' + (x.idx === 0 ? "Следующая" : "Через " + x.idx + " " + plural(x.idx, "песню", "песни", "песен")) + " · " + minTxt(x.eta || 0) + "</span>" +
      (x.skip ? '<br><span class="sg-tag">вне очереди</span>' : "") + "</div><span></span>" +
      ((x.by_me || tb.role === "owner") ? '<button type="button" class="sg-x" data-cancel="' + x.id + '" aria-label="Убрать песню">×</button>' : "<span></span>") + "</div>";
  }).join("") : '<div class="sg-empty" style="padding:12px 0">Пока нет. Добавьте песню из каталога или избранного</div>';
  h += hallBlock();
  // друзья за столом
  const mem = tb.members || [];
  h += '<div class="sg-sec">За столом <span>' + (mem.length + 1) + "</span></div><div>";
  h += '<div class="sg-mem"><div class="sg-t"><b>' + esc(tb.owner_name || "Хозяин брони") + "</b><span>бронь на этот стол</span></div>" + (tb.role === "owner" ? '<span class="sg-pill on">вы</span>' : "<span></span>") + "<span></span></div>";
  h += mem.map(m => '<div class="sg-mem"><div class="sg-t"><b>' + esc(m.name || "Друг") + "</b><span>" + (m.via === "phone" ? "добавлен по номеру " + esc(m.phone || "") : "вошёл по коду") + "</span></div>" +
    (m.me ? '<span class="sg-pill on">вы</span>' : m.joined ? '<span class="sg-pill on">заказывает</span>' : '<span class="sg-pill wait">ждём вход</span>') +
    (tb.role === "owner" ? '<button type="button" class="sg-x" data-unm="' + m.id + '" aria-label="Убрать из-за стола">×</button>' : "<span></span>") + "</div>").join("");
  h += "</div>";
  if (tb.role === "owner"){
    h += '<div class="sg-sec">Добавить друга за стол</div><div style="font-size:13px;color:var(--muted);line-height:1.45">Друг сможет заказывать песни на ваш стол - в общий лимит стола (' + tb.limit + '). Доступ до конца вечера.</div>' +
      '<div class="sg-in"><input id="sg-fphone" type="tel" inputmode="numeric" placeholder="Номер друга: 93 555 56 78" autocomplete="off" aria-label="Номер друга"><button type="button" id="sg-fadd">Добавить</button></div><div id="sg-fmsg"></div>' +
      '<button type="button" class="sg-btn ghost" id="sg-link">Код для друга</button><div id="sg-linkbox"></div>';
  } else {
    h += '<button type="button" class="sg-btn ghost" id="sg-leave">Выйти из-за стола</button>';
  }
  return h;
}
function hallBlock(){
  const me = PS.me, hall = me.hall || {}, p = hall.playing, q = hall.queue || [];
  let h = '<div class="sg-sec">Что поют в зале <span>' + (q.length + (p ? 1 : 0)) + "</span></div><div>";
  if (p) h += '<div class="sg-hall now' + (p.mine ? " mine" : "") + '"><span class="sg-hp">сейчас</span><div class="sg-t"><b>' + esc(p.t) + "</b><span>" + esc(p.a) + " · стол " + p.table_no + "</span></div>" + (table() ? likeBtn(p) : "<span></span>") + "</div>";
  h += q.map((x, i) => '<div class="sg-hall' + (x.mine ? " mine" : "") + '"><span class="sg-hp">' + (i + 1) + '</span><div class="sg-t"><b>' + esc(x.t) + "</b><span>" + esc(x.a) + "</span></div>" + (x.mine ? '<span class="sg-pill on">ваша</span>' : "<span></span>") + "</div>").join("");
  if (!p && !q.length) h += '<div class="sg-empty" style="padding:12px 0">В зале пока никто не заказал</div>';
  h += "</div>";
  const rec = hall.recent || [];
  if (rec.length && table()){
    h += '<div class="sg-sec">Уже спели <span>лайк - голос за лучшее исполнение</span></div><div>' +
      rec.map(x => { const d = new Date(x.at); return '<div class="sg-hall' + (x.mine ? " mine" : "") + '"><span class="sg-hp">' + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + '</span><div class="sg-t"><b>' + esc(x.t) + "</b><span>" + esc(x.a) + " · стол " + x.table_no + "</span></div>" + likeBtn(x) + "</div>"; }).join("") + "</div>";
  }
  return h;
}

function render(){
  const sec = SEC(); if (!sec) return;
  if (PS.err === "no_tg" || PS.err === "bad_init_data" || PS.err === "test_mode"){
    sec.innerHTML = '<div class="sg-h"><h2>Песни</h2></div><div class="sg-empty"><b>' + esc(errText(PS.err)) + "</b>Каталог песен и заказ на стол работают внутри Telegram</div>";
    return;
  }
  const tb = table();
  const qn = PS.me ? (PS.me.mine || []).filter(x => x.status === "queued").length : 0;
  const active = document.activeElement && document.activeElement.id;
  const keepScroll = window.scrollY;
  let body = PS.tab === "cat" ? scrCat() : PS.tab === "fav" ? scrFav() : scrTable();
  const head = '<div class="sg-h"><h2>Песни</h2><span>Большой зал · AST-250</span></div>' +
    '<div class="sg-tabs" role="tablist">' +
    '<button type="button" data-tab="cat" class="' + (PS.tab === "cat" ? "on" : "") + '">Каталог</button>' +
    '<button type="button" data-tab="fav" class="' + (PS.tab === "fav" ? "on" : "") + '">Избранное</button>' +
    '<button type="button" data-tab="table" class="' + (PS.tab === "table" ? "on" : "") + '">Мой стол' + (tb && qn ? '<span class="sg-badge">' + qn + "</span>" : "") + "</button></div>" +
    '<div id="sg-pb">' + pollBanner() + "</div>";
  // при поиске не трогаем поле ввода - перерисовываем только список
  if (PS.tab === "cat" && document.getElementById("sg-q") && sec.dataset.tab === "cat"){
    sec.querySelector(".sg-tabs").outerHTML = head.slice(head.indexOf('<div class="sg-tabs"'), head.indexOf('<div id="sg-pb">'));
    const pb = document.getElementById("sg-pb"); if (pb) pb.innerHTML = pollBanner();
    const note = sec.querySelector(".sg-note"); const nn = orderNote();
    if (note && nn) note.outerHTML = nn; else if (note && !nn) note.remove();
    else if (!note && nn) document.getElementById("sg-list").insertAdjacentHTML("beforebegin", nn);
    renderList();
    return;
  }
  // не перерисовываем, пока гость печатает в поле на «Мой стол»
  if (PS.tab === "table" && ["sg-fphone", "sg-code"].includes(active) && sec.dataset.tab === "table") return;
  sec.innerHTML = head + body;
  sec.dataset.tab = PS.tab;
  if (PS.tab === "cat") renderList();
  window.scrollTo(0, keepScroll);
  if (active === "sg-q"){ const i = document.getElementById("sg-q"); if (i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

/* ---------- действия ---------- */
async function addSong(n){
  const s = songData(n) || findInMe(n);
  if (!s) return;
  const d = await call("add", { n: s.n, t: s.t, a: s.a, d: s.d });
  if (d.error){ toast(errText(d.error)); haptic("error"); }
  else { haptic("success"); toast("На столе! Ваша песня примерно через " + Math.max(1, Math.round((d.eta || 0) / 60)) + " мин"); }
  await refresh();
}
function findInMe(n){
  const me = PS.me || {};
  const f = (me.favs || []).find(x => x[0] === n) || (me.top || []).find(x => x[0] === n);
  if (f) return { n: f[0], t: f[1], a: f[2], d: f[3] };
  for (const v of (me.history || [])) for (const x of v.songs) if (x[0] === n) return { n: x[0], t: x[1], a: x[2], d: x[3] };
  return null;
}
async function toggleFav(n){
  const s = songData(n) || findInMe(n);
  if (!s) return;
  const was = PS.favSet.has(n);
  if (was) PS.favSet.delete(n); else PS.favSet.add(n);
  render();
  const d = await call("fav", { n: s.n, t: s.t, a: s.a, d: s.d });
  if (d.error) toast(errText(d.error)); else toast(d.fav ? "Добавлено в избранное" : "Убрано из избранного");
  await refresh();
}
function shareContact(){
  const tg = window.Telegram && window.Telegram.WebApp;
  const msg = document.getElementById("sg-share-msg");
  const done = async (contactRaw) => {
    if (msg) msg.innerHTML = '<div class="sg-msg ok">Проверяем номер…</div>';
    const d = await fn({ action: "phone", initData: tg.initData, contact: contactRaw || "" });
    if (d.token){ PS.token = d.token; try{ sessionStorage.setItem("sg_token", d.token); }catch(_){} haptic("success"); toast("Номер подтверждён"); await refresh(); }
    else if (msg) msg.innerHTML = '<div class="sg-msg">' + esc(errText(d.error || "phone")) + "</div>";
  };
  if (!tg || typeof tg.requestContact !== "function"){ done(""); return; }
  try{
    tg.requestContact((ok, res) => {
      if (!ok){ if (msg) msg.innerHTML = '<div class="sg-msg">Без номера не найти вашу бронь. Можно войти по коду стола от друга.</div>'; return; }
      done(res && res.response ? res.response : "");
    });
  }catch(_){ done(""); }
}
async function join(code){
  const box = document.getElementById("sg-join-msg");
  const d = await call("join", { code });
  if (d.error){ if (box) box.innerHTML = '<div class="sg-msg">' + esc(errText(d.error)) + "</div>"; else toast(errText(d.error)); return; }
  haptic("success"); toast("Вы за столом " + d.table_no + " - можно заказывать песни");
  PS.tab = "table"; await refresh();
}

function onClick(e){
  const t = e.target;
  const tabB = t.closest("[data-tab]"); if (tabB && tabB.closest(".sg-tabs")){ PS.tab = tabB.dataset.tab; render(); window.scrollTo(0, 0); if (PS.tab === "cat") loadCat(); return; }
  const m = t.closest("[data-mode]"); if (m){ PS.mode = m.dataset.mode; PS.limit = 60; if (PS.mode !== "all") PS.q = ""; const i = document.getElementById("sg-q"); if (i && PS.mode !== "all") i.value = ""; document.querySelectorAll("#sec-songs [data-mode]").forEach(b => b.classList.toggle("on", b === m)); renderList(); return; }
  const fm = t.closest("[data-fm]"); if (fm){ PS.fmode = fm.dataset.fm; render(); return; }
  const more = t.closest("[data-more]"); if (more){ PS.limit += 60; renderList(); return; }
  const f = t.closest("[data-fav]"); if (f){ toggleFav(+f.dataset.fav); return; }
  const a = t.closest("[data-add]"); if (a && !a.disabled){ a.disabled = true; addSong(+a.dataset.add); return; }
  const c = t.closest("[data-cancel]"); if (c){ c.disabled = true; call("cancel", { id: +c.dataset.cancel }).then(d => { toast(d.error ? errText(d.error) : "Песня убрана из очереди"); refresh(); }); return; }
  const lk = t.closest("[data-like]"); if (lk){ lk.disabled = true; call("like", { id: +lk.dataset.like }).then(d => { if (d.error) toast(errText(d.error)); else haptic("success"); refresh(); }); return; }
  const um = t.closest("[data-unm]"); if (um){ call("unmember", { id: +um.dataset.unm }).then(d => { toast(d.error ? errText(d.error) : "Убран из-за стола"); refresh(); }); return; }
  if (t.closest("#sg-share")){ shareContact(); return; }
  if (t.closest("#sg-join")){ const v = (document.getElementById("sg-code") || {}).value || ""; if (v.trim().length < 4){ toast("Введите код стола"); return; } join(v.trim()); return; }
  if (t.closest("#sg-fadd")){
    const inp = document.getElementById("sg-fphone"), box = document.getElementById("sg-fmsg");
    const v = (inp.value || "").replace(/\D/g, "");
    if (v.replace(/^998/, "").length !== 9){ box.innerHTML = '<div class="sg-msg">' + errText("bad_phone") + "</div>"; return; }
    call("invite_phone", { phone: v }).then(d => {
      if (d.error){ box.innerHTML = '<div class="sg-msg">' + esc(errText(d.error)) + "</div>"; return; }
      inp.value = ""; haptic("success");
      toast("Друг добавлен. Когда он откроет приложение SPLETNI и поделится номером, сможет заказывать на ваш стол");
      refresh();
    });
    return;
  }
  if (t.closest("#sg-link")){
    call("invite_link").then(d => {
      const box = document.getElementById("sg-linkbox"); if (!box) return;
      if (d.error){ box.innerHTML = '<div class="sg-msg">' + esc(errText(d.error)) + "</div>"; return; }
      const link = (window.SONGS_INVITE_BASE ? window.SONGS_INVITE_BASE + "stol-" + d.code : "");
      box.innerHTML = '<div class="sg-code">' + esc(d.code) + '</div><div style="font-size:13px;color:var(--muted);line-height:1.45;text-align:center">Друг открывает приложение SPLETNI → «Песни» → «Мой стол» и вводит этот код. Код действует до конца вечера.</div>' +
        (link ? '<button type="button" class="sg-btn" id="sg-sendlink" data-link="' + esc(link) + '">Отправить ссылку в Telegram</button>' : "");
    });
    return;
  }
  const sl = t.closest("#sg-sendlink");
  if (sl){
    const url = "https://t.me/share/url?url=" + encodeURIComponent(sl.dataset.link) + "&text=" + encodeURIComponent("Заходи за наш стол в SPLETNI - будем заказывать песни вместе");
    try{ Telegram.WebApp.openTelegramLink(url); }catch(_){ window.open(url, "_blank"); }
    return;
  }
  if (t.closest("#sg-leave")){ if (!confirm("Выйти из-за стола? Заказывать песни на этот стол вы больше не сможете.")) return; call("leave").then(() => { toast("Вы вышли из-за стола"); refresh(); }); return; }
}
let qTimer = null;
function onInput(e){
  if (e.target.id === "sg-q"){
    PS.q = e.target.value; PS.limit = 60;
    if (PS.mode !== "all"){ PS.mode = "all"; document.querySelectorAll("#sec-songs [data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === "all")); }
    clearTimeout(qTimer); qTimer = setTimeout(renderList, 120);
  }
}

/* ---------- открытие / закрытие вкладки ---------- */
let bound = false;
async function open(){
  injectCss();
  const sec = SEC(); if (!sec) return;
  if (!bound){ sec.addEventListener("click", onClick); sec.addEventListener("input", onInput); bound = true;
    sec.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "sg-code") document.getElementById("sg-join").click(); if (e.key === "Enter" && e.target.id === "sg-fphone") document.getElementById("sg-fadd").click(); }); }
  if (!PS.token){ try{ PS.token = sessionStorage.getItem("sg_token"); }catch(_){} }
  render();
  loadCat();
  if (!PS.token){ const ok = await login(); if (!ok){ render(); return; } }
  // ссылка-приглашение: startapp=stol-КОД
  const sp = PS.startParam || (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param);
  if (sp && /^stol-/i.test(sp) && !PS.joinedFromLink){ PS.joinedFromLink = true; await join(sp.slice(5)); }
  await refresh();
  if (PS.me && PS.me.table && !PS.openedOnce) PS.tab = "table";
  PS.openedOnce = true;
  render();
  clearInterval(PS.poll);
  let ticks = 0;   // обычно раз в 8 сек, во время голосования - раз в 4 сек
  PS.poll = setInterval(() => { if (document.hidden || (typeof CUR !== "undefined" && CUR !== "songs")) return; ticks++; if ((PS.me && PS.me.poll) || ticks % 2 === 0) refresh(); }, 4000);
}
function close(){ clearInterval(PS.poll); PS.poll = null; }
// при запуске гостевого приложения: показывать ли вкладку «Песни».
// Тестовый режим (song_settings.test_mode) - только тестовым Telegram-аккаунтам, иначе всем.
async function init(){
  let vis = false;
  try{
    const r = await fetch(SB_URL + "/rest/v1/rpc/song_flags", { method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_ANON, Authorization: "Bearer " + SB_ANON }, body: "{}" });
    const f = await r.json();
    if (f && f.test_mode === false) vis = true;
    else if (f && f.test_mode === true) vis = await login();
  }catch(_){ vis = false; }
  window.SONGS_VISIBLE = vis;
  try{ if (typeof renderNav === "function") renderNav(); }catch(_){}
  if (!vis) return;
  let sp = null; try{ sp = Telegram.WebApp.initDataUnsafe.start_param || null; }catch(_){}
  const q = new URLSearchParams(location.search);
  if (q.get("tab") === "songs" || (sp && /^stol-/i.test(sp))) go("songs");
}
window.PesniInit = init;
document.addEventListener("visibilitychange", () => { if (!document.hidden && PS.poll && Date.now() - PS.lastMe > 5000) refresh(); });
window.PesniOpen = open;
window.PesniClose = close;
window.PesniState = PS;  // для отладки
})();
