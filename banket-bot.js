/* SPLETNI · «Банкет» в гостевом приложении (guest.html, бот @spletni_ai_bot)
   Сборка 2 · 18.11.2026 - количество подарка по числу гостей
   Сборка 1 · 18.11.2026 - тестовый доступ: раздел видят только тестеры (bq_bot_testers) или все, когда
   в программе банкетов включено «Заявки гостей на банкет».
   3 шага: гости, дата и повод -> зал или кабинка -> предложение (GOLD / PLATINUM / DIAMOND или «своё меню»).
   Заявка падает в программу банкетов в «Новые» (источник «Гостевой бот»), гостю - сообщение в бот.
   Вход - токен guest-auth (подпись Telegram); данные - rpc bq_bot(действие, данные). Себестоимости здесь нет.
   Использует из guest.html: SB, guestAuth(), go(), esc(), PHONE_KAR. */
(function(){
"use strict";
const BQ = { info:null, step:1, g:10, date:"", time:"19:00", occ:"", place:"", pack:"", own:false,
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
    return false; }).map(x => { const q = +x.qty > 0 ? Math.max(1, Math.ceil(+x.qty * BQ.g / ((BQ.info && BQ.info.packBase) || 10) - 1e-9)) : 0;
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
  el.innerHTML = BQ.done ? viewDone() : BQ.step === 1 ? view1() : BQ.step === 2 ? view2() : view3();
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
      <div class="im" ${p.photo ? `style="background-image:url('${esc(p.photo)}')"` : ""}>${p.video && !why ? `<em data-a="video" data-v="${esc(p.video)}">видео</em>` : ""}</div>
      <div class="bd"><b>${esc(p.title)}</b><span>до ${p.max} ${pl(+p.max, "гостя", "гостей", "гостей")}${p.about ? " · " + esc(p.about) : ""}</span>${why ? `<span class="why">${esc(why)}</span>` : ""}</div></button>`).join("")}</div>
    <div class="bq-hint">Столы выбирать не нужно - рассадку сделает менеджер.</div>
    <div class="bq-msg" id="bq-msg">${esc(BQ.err)}</div>
    <button class="bk-submit" data-a="next2">Дальше - предложение</button>`;
}
function view3(){
  const packs = BQ.info.packs || [], k = mult(), base = (BQ.info.packBase || 10), cls = t => /gold/i.test(t) ? "bq-g" : /plat/i.test(t) ? "bq-p" : /diam/i.test(t) ? "bq-d" : "";
  const pk = K(BQ.pack), sum = pk ? (+pk.price || 0) * BQ.g : null, gf = gifts(sum);
  const short = x => (x.items || []).slice(0, 7).map(i => i.n).join(", ") + ((x.items || []).length > 7 ? "…" : "");
  return `${steps(3)}<button class="bq-back" data-a="to" data-v="2">← ${esc(P(BQ.place) ? P(BQ.place).title : "зал")} · ${BQ.g} ${pl(BQ.g, "гость", "гостя", "гостей")}</button>
    ${packs.map(x => `<div class="bq-pk ${BQ.pack === x.id ? "on" : ""}" data-a="pack" data-v="${esc(x.id)}">
        <div class="t"><b class="${cls(x.title)}">${esc(x.title)}</b><span>${fmt(x.price)} <small>на гостя</small></span></div>
        ${x.descr ? `<div class="ds">${esc(x.descr)}</div>` : ""}<div class="it">${esc(short(x))}</div>
        <div class="lk" data-a="comp" data-v="${esc(x.id)}">${BQ.open === x.id ? "Скрыть состав" : "Весь состав на " + BQ.g + " " + pl(BQ.g, "гостя", "гостей", "гостей")}</div>
        ${BQ.open === x.id ? `<div class="bq-comp">${(x.items || []).map(i => `<div><span>${esc(i.n)}</span><span>${fmt1((+i.q || 0) * k)} ${esc(i.u || "")}</span></div>`).join("")}
          <div class="bq-hint">Количество - на ${BQ.g} ${pl(BQ.g, "гостя", "гостей", "гостей")} (состав рассчитан на каждые ${base}).</div></div>` : ""}</div>`).join("")}
    <div class="bq-pk ${BQ.own ? "on" : ""}" data-a="own"><div class="t"><b style="font-size:14px;letter-spacing:0">Своё меню</b></div><div class="ds" style="margin:2px 0 0">соберём вместе с менеджером</div></div>
    <div class="bq-h">Контакты</div>
    <input class="bk-input" id="bq-name" placeholder="Имя" value="${esc(BQ.name)}" style="margin-bottom:8px">
    <input class="bk-input" id="bq-phone" type="tel" placeholder="+998 __ ___ __ __" value="${esc(BQ.phone)}" style="margin-bottom:8px">
    <textarea class="bk-input" id="bq-wish" rows="2" placeholder="Пожелания (необязательно)">${esc(BQ.wish)}</textarea>
    <div class="bq-sum"><div class="r"><span>${pk ? BQ.g + " × " + fmt(pk.price) : BQ.own ? "Своё меню" : "Выберите предложение"}</span><b>${pk ? fmt(sum) + " сум" : BQ.own ? "расчёт пришлёт менеджер" : ""}</b></div>
      <div class="bq-hint">${(+BQ.info.servicePct || 0) ? "Обслуживание " + BQ.info.servicePct + "%" : "Обслуживание 0%"}${gf.length ? " · " + esc(giftTxt(gf)) + " - в подарок" : ""}. Итог предварительный - точный расчёт пришлёт менеджер.</div></div>
    <div class="bq-msg" id="bq-msg">${esc(BQ.err)}</div>
    <button class="bk-submit" data-a="send" ${BQ.sending ? "disabled" : ""}>${BQ.sending ? "Отправляю…" : "Отправить заявку"}</button>`;
}
function viewDone(){
  const x = BQ.done, pk = K(x.pack), p = P(x.place), sum = pk ? (+pk.price || 0) * x.g : null, gf = gifts(sum), tel = (BQ.info.phone || "").replace(/[^\d+]/g, "") || (typeof PHONE_KAR !== "undefined" ? PHONE_KAR : "");
  return `<div class="bq-ok"><div class="ring"></div><b>Заявка отправлена</b><div class="bq-id">ID ${esc(x.code)}</div>
      <p>Менеджер свяжется с вами и пришлёт расчёт сюда, в бот. Дата закрепляется после депозита ${BQ.info.depositPct || 10}%.</p></div>
    <div class="info-card" style="padding:6px 14px">
      ${x.occ ? `<div class="bq-kv"><span>Повод</span><b>${esc(x.occ)}</b></div>` : ""}
      <div class="bq-kv"><span>Когда</span><b>${esc(dLab(x.date))} · ${esc(x.time)}</b></div>
      <div class="bq-kv"><span>Гостей</span><b>${x.g}</b></div>
      <div class="bq-kv"><span>Где</span><b>${esc(p ? p.title : "")}</b></div>
      <div class="bq-kv"><span>Предложение</span><b>${pk ? esc(pk.title) + " · ≈ " + fmt(sum) : "своё меню"}</b></div>
      ${gf.length ? `<div class="bq-kv"><span>Подарки</span><b>${esc(giftTxt(gf))}</b></div>` : ""}</div>
    ${tel ? `<a class="bk-submit ghost" style="display:block;text-align:center;text-decoration:none" href="tel:${esc(tel)}">Позвонить: ${esc(BQ.info.phone || tel)}</a>` : ""}
    <button class="bk-submit ghost" data-a="again">Новая заявка</button>`;
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
    else if (a === "send"){ await send(); return; }
    else if (a === "again"){ BQ.done = null; BQ.step = 1; BQ.place = ""; BQ.pack = ""; BQ.own = false; BQ.wish = ""; window.scrollTo(0, 0); }
    render();
  });
}
async function send(){
  if (BQ.sending) return;
  if (!BQ.pack && !BQ.own){ BQ.err = "Выберите предложение или «Своё меню»"; render(); return; }
  if ((BQ.name || "").trim().length < 2){ BQ.err = "Укажите имя"; render(); return; }
  if ((BQ.phone || "").replace(/\D/g, "").length < 9){ BQ.err = "Укажите телефон"; render(); return; }
  BQ.sending = true; render();
  const d = await rpc("request", { name:BQ.name, phone:BQ.phone, date:BQ.date, time:BQ.time, guests:String(BQ.g), place:BQ.place, occ:BQ.occ, pack:BQ.pack || "", wish:BQ.wish });
  BQ.sending = false;
  if (!d || !d.ok){ BQ.err = (d && d.error) || "Не получилось отправить - попробуйте ещё раз"; render(); return; }
  haptic("success");
  BQ.done = { code:d.code, pack:BQ.pack, place:BQ.place, g:BQ.g, date:BQ.date, time:BQ.time, occ:BQ.occ };
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
