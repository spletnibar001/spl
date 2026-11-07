/* SPLETNI · вкладка «Песни» в гостевом приложении (guest.html)
   Сборка 9 · 07.11.2026 («Позвать компанию»: приглашения друзьям по брони ?invite=, ответы ?inv=&a=)
   Сборка 8 · 07.11.2026 (вкладка «Сегодня»: зал или кабинка по брони, бронь кабинки до посадки)
   Сборка 7 · 07.11.2026 («Мои песни»: список + избранное, песни с YouTube для кабинок, «Вы в кабинке»)
   Сборка 6 · 06.11.2026 (кнопка «Не напоминать» из сообщения бота: ?noremind=1)
   Сборка 5 · 07.10.2026 (пожелание к песне, повтор, подборки, карточка вечера, «искали и не нашли»)
   - каталог AST-250 (songs.json), поиск, топ недели, новинки, подборки звукооператора
   - избранное и «История» (что и когда спето) + карточка вечера для сторис
   - заказ: пожелание звукооператору (дуэт, тон, версия), предупреждение «сегодня уже пели»
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
  token: null, me: null, cat: null, catErr: "", tab: "cat", fmode: null, mode: "all", q: "", ccode: null,
  limit: 60, poll: null, busy: false, err: "", startParam: null, joinedFromLink: false,
  favSet: new Set(), lastMe: 0, sheet: null, missSent: new Set(), pendingCard: null,
  inv: null, invData: null, invSel: new Set(), invErr: ""      // сборка 9: «Позвать компанию»
};
// пожелания к песне: метка -> текст; «ниже/выше» и «женская/мужская» - одно из двух
const WISH = { duet: "Дуэт", lower: "Тон ниже", higher: "Тон выше", female: "Женская версия", male: "Мужская версия" };
const WISH_PAIR = { lower: "higher", higher: "lower", female: "male", male: "female" };
const wishTxt = w => (w || []).map(x => (WISH[x] || x).toLowerCase()).join(" · ");
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
  test_mode: "Песни пока работают в тестовом режиме",
  card_limit: "Сегодня уже 10 карточек - попробуйте завтра",
  tg_send: "Бот не смог написать вам. Откройте чат с ботом SPLETNI, нажмите «Старт» и попробуйте ещё раз",
  bad_image: "Не получилось нарисовать карточку",
  unknown_action: "Эта функция появится после обновления сервера",
  not_found: "Песня уже не в очереди",
  bad_song: "Укажите название песни",
  list_full: "В списке уже 100 песен - уберите лишние",
  fav_limit: "В избранном уже 500 песен",
  not_in_cabin: "Вы сейчас не в кабинке",
  need_phone: "Сначала поделитесь номером во вкладке «Сегодня»",
  retry: "Новый код можно взять через минуту",
  booking_closed: "Эта бронь уже закрыта",
  bad_args: "Ссылка устарела - откройте последнее сообщение бота"
};
const errText = e => ERR[e] || ("Ошибка: " + e);

/* ---------- стили (в цветах guest.html) ---------- */
const CSS = `
#sec-songs{padding:14px 14px 96px}
.sg-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:2px 0 12px}
.sg-h h2{margin:0;font-size:22px;font-weight:800}
.sg-h span{font-size:12px;color:var(--muted)}
.sg-tabs{display:flex;gap:6px;margin-bottom:12px}
.sg-tabs button{flex:1 1 0;min-width:0;position:relative;padding:10px 2px;border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:11px;font-size:13px;font-weight:700;white-space:nowrap}
.sg-tabs .tl{display:block;overflow:hidden;text-overflow:ellipsis}
@media (max-width:370px){.sg-tabs{gap:4px}.sg-tabs button{font-size:11.5px;padding:9px 1px}}
.sg-hday{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:16px 0 4px;padding-bottom:5px;border-bottom:1px solid var(--line)}
.sg-hday b{font-size:14px}
.sg-hday span{font-size:12px;color:var(--muted);white-space:nowrap}
.sg-hsum{font-size:12.5px;color:var(--muted);margin:0 0 6px}
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
/* сборка 9: «Позвать компанию» - выбранный друг: зелёная рамка, без галочек */
.sg-fr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;width:100%;text-align:left;padding:11px 12px;margin-top:8px;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:12px;font:inherit}
.sg-fr.on{border-color:var(--emerald);background:rgba(31,191,122,.08)}
.sg-fr b{display:block;font-size:15px}
.sg-fr small{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.sg-fr .st{font-size:12px;font-weight:700;color:var(--muted);white-space:nowrap}
.sg-fr .st.yes{color:var(--emerald)}
.sg-fr .st.no{color:#ec8079}
.sg-fr.off{opacity:.65}
.sg-back{border:0;background:transparent;color:var(--muted);font:inherit;font-size:13px;padding:0;margin:0 0 8px}
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
/* сборка 5: пожелания, повтор, подборки, карточка вечера */
.sg-t span.sg-eta,.sg-t span.sg-w,.sg-t span.sg-tag,.sg-t span.sg-zone{display:inline-block}
.sg-rep{display:block;font-size:11.5px;font-weight:700;color:var(--gold);margin-top:2px}
.sg-w{display:inline-block;margin:4px 4px 0 0;font-size:11px;font-weight:800;color:var(--emerald);border:1px solid rgba(31,191,122,.6);border-radius:5px;padding:0 6px}
.sg-wbtn{display:inline-block;margin-top:5px;padding:3px 9px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--muted);font-size:12px;font-weight:700}
#sg-sheet{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}
#sg-sheet[hidden]{display:none}
.sg-sh{width:min(560px,100%);max-height:88vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-bottom:0;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom))}
.sg-sh .hd{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;align-items:center;margin-bottom:10px}
.sg-sh .hd .sg-num{font-size:22px}
.sg-sh .lb{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:12px 0 8px}
.sg-wch{display:flex;flex-wrap:wrap;gap:8px}
.sg-wch button{padding:9px 13px;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:20px;font-size:14px;font-weight:700}
.sg-wch button.on{border-color:var(--emerald);color:var(--emerald);background:rgba(31,191,122,.12)}
.sg-sh .acts{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:14px}
.sg-sh .acts .sg-btn{margin-top:0}
.sg-sh .acts .sg-btn.ghost{width:auto;padding:13px 18px}
.sg-cbtn{display:inline-flex;align-items:center;gap:6px;margin:2px 0 4px;padding:6px 11px;border:1px solid rgba(255,111,154,.5);background:rgba(255,111,154,.08);color:#ff8fb0;border-radius:10px;font-size:12.5px;font-weight:800}
#sg-cardov{position:fixed;inset:0;z-index:96;background:rgba(5,6,8,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:14px 14px calc(14px + env(safe-area-inset-bottom))}
#sg-cardov[hidden]{display:none}
#sg-cardov img{max-width:100%;max-height:calc(100vh - 210px);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
#sg-cardov .t{max-width:440px;text-align:center;color:var(--muted);font-size:13px;line-height:1.45}
#sg-cardov .row{display:flex;gap:8px;width:min(440px,100%)}
#sg-cardov .row .sg-btn{margin-top:0}
#sg-cardov .row .sg-btn.ghost{width:auto;padding:13px 18px}
/* сборка 7: «Мои песни», YouTube, кабинка */
.sg-src{display:inline-grid;place-items:center;width:40px;height:24px;border-radius:6px;font-size:11px;font-weight:800;background:var(--panel2);color:var(--muted)}
.sg-src.yt{background:rgba(226,101,92,.15);color:#ec8079}
.sg-zone{display:inline-block;margin-top:4px;font-size:11px;font-weight:700;border-radius:8px;padding:0 7px;border:1px solid rgba(31,191,122,.5);color:var(--emerald)}
.sg-zone.cab{border-color:rgba(201,161,74,.55);color:var(--gold)}
.sg-wbtn.in{border-color:var(--emerald);color:var(--emerald)}
.sg-wbtn + .sg-wbtn{margin-left:6px}
.sg-cabtxt{font-size:12px;color:var(--muted);text-align:right;white-space:nowrap}
.sg-cab{border:1px solid rgba(31,191,122,.45);background:rgba(31,191,122,.07);border-radius:14px;padding:13px 14px;margin-bottom:12px}
.sg-cab .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.sg-cab .top b{font-size:16px}
.sg-cab .top span,.sg-cab p{font-size:12.5px;color:var(--muted)}
.sg-cab p{margin:6px 0 10px;line-height:1.4}
.sg-cab .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.sg-cab .two .sg-btn{margin-top:0;padding:12px 6px;font-size:14px}
.sg-cab .two .sg-btn.full{background:var(--emerald);color:#06130d}
.sg-digits{display:flex;justify-content:center;gap:10px;margin:12px 0 8px}
.sg-digits span{width:54px;height:66px;border-radius:12px;background:var(--panel);border:1px solid var(--line);display:grid;place-items:center;font-size:34px;font-weight:900;font-variant-numeric:tabular-nums}
.sg-cnote{font-size:12.5px;color:var(--muted);text-align:center;line-height:1.45}
.sg-ytadd{display:block;width:100%;margin-top:12px;padding:13px;border:1px dashed var(--line);background:transparent;color:var(--text);border-radius:12px;font-size:14px;font-weight:700}
.sg-sh label{display:block;font-size:12.5px;color:var(--muted);margin-top:10px}
.sg-sh label input{display:block;width:100%;box-sizing:border-box;margin-top:5px;height:44px;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:11px;padding:0 12px;font-size:15px;outline:none;font-family:inherit}
.sg-sh label input:focus{border-color:var(--emerald)}
.sg-sh .acts.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
#sg-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);max-width:min(92vw,520px);z-index:90;background:#eef1f4;color:#0d0f12;padding:10px 16px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.4);display:none;text-align:center}
`;

function injectCss(){
  if (document.getElementById("sg-css")) return;
  const st = document.createElement("style"); st.id = "sg-css"; st.textContent = CSS; document.head.appendChild(st);
  const t = document.createElement("div"); t.id = "sg-toast"; document.body.appendChild(t);
  const sh = document.createElement("div"); sh.id = "sg-sheet"; sh.hidden = true; document.body.appendChild(sh);
  sh.addEventListener("click", onSheetClick);
  sh.addEventListener("input", onSheetInput);
  const co = document.createElement("div"); co.id = "sg-cardov"; co.hidden = true; document.body.appendChild(co);
  co.addEventListener("click", onCardClick);
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
  if (d && !d.error && d.my === undefined){   // сервер без сборки 7.4: список и кабинку берём отдельно
    const l = await call("my_list");
    if (l && l.ok){ d.my = l.list || []; d.cabin = l.cabin || null; }
  }
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
    // каталог: pesni/songs.json, запасной путь - songs.json рядом с guest.html
    let r = await fetch("pesni/songs.json", { cache: "force-cache" }).catch(() => null);
    if (!r || !r.ok) r = await fetch("songs.json", { cache: "force-cache" });
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
// сегодня эту песню уже пели (или она в очереди зала)?
function tonight(n){ const m = PS.me && PS.me.tonight; return m ? m[String(n)] || null : null; }
function repTxt(r){ return !r ? "" : r.s === "q" ? "уже в очереди зала · стол " + r.t : "сегодня уже пели" + (r.at ? " в " + r.at : "") + " · стол " + r.t; }
function addBtn(n){
  const tb = table();
  if (!(tb && tb.status === "seated")) return "";
  const full = (PS.me.mine || []).filter(x => x.status === "queued").length >= tb.limit;
  return inMine(n) ? '<button type="button" class="sg-add in" disabled>На столе</button>'
    : '<button type="button" class="sg-add" data-add="' + n + '"' + (!canOrder() || full ? " disabled" : "") + ">На стол</button>";
}
// «Мой список» (сборка 7): песня AST уже в списке?
const myList = () => (PS.me && PS.me.my) || [];
const inMy = n => myList().find(x => x.song_no === n) || null;
const inCabin = () => !!(PS.me && PS.me.cabin);
function songRow(n, t, a, d, extra, noRep, under){
  const fav = PS.favSet.has(n);
  const rep = noRep ? "" : repTxt(tonight(n));
  const add = addBtn(n);
  const ml = PS.me && PS.me.my ? (inMy(n) ? '<button type="button" class="sg-wbtn in" data-ml="' + n + '">В моём списке</button>' : '<button type="button" class="sg-wbtn" data-ml="' + n + '">В мой список</button>') : "";
  return '<div class="sg-row"><span class="sg-num">' + n + '</span><div class="sg-t"><b>' + esc(t) + '</b><span>' + esc(a) + (d ? " · " + mmss(d) : "") + (extra || "") + "</span>" + (rep ? '<span class="sg-rep">' + esc(rep) + "</span>" : "") + (under != null ? under : ml) + "</div>" +
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
  if (!PS.me.reg && !tb) return '<div class="sg-note">Чтобы заказывать песни на свой стол, откройте <b>«Сегодня»</b> и поделитесь номером - тем, на который бронь.</div>';
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
    .concat(((PS.me && PS.me.colls) || []).map(x => '<button type="button" class="' + (PS.mode === "c" + x.id ? "on" : "") + '" data-mode="c' + x.id + '">' + esc(x.title) + "</button>"))
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
  if (PS.mode.startsWith("c")){          // подборка звукооператора
    const cl = ((PS.me && PS.me.colls) || []).find(x => "c" + x.id === PS.mode);
    if (!cl) return '<div class="sg-empty"><b>Подборка пока пуста</b></div>';
    return (cl.songs || []).map(x => songRow(x[0], x[1], x[2], x[3])).join("");
  }
  if (!PS.cat) return '<div class="sg-empty"><b>Загружаем каталог…</b>63 000 песен AST-250</div>';
  const res = searchCat();
  if (!PS.q.trim() && PS.mode === "all") return '<div class="sg-empty"><b>63 000+ песен с номерами AST-250</b>Начните вводить название, исполнителя или номер. Можно латиницей.</div>';
  if (!res.length){ noteMiss(PS.q); return '<div class="sg-empty"><b>Ничего не нашлось</b>Попробуйте иначе: часть названия или фамилию исполнителя</div>'; }
  const c = PS.cat;
  let h = res.slice(0, PS.limit).map(i => songRow(c.n[i], c.t[i], c.A[c.a[i]], c.d[i])).join("");
  if (res.length > PS.limit) h += '<button type="button" class="sg-more" data-more="1">Показать ещё (' + (res.length - PS.limit) + ")</button>";
  return h;
}
function renderList(){ const el = document.getElementById("sg-list"); if (el) el.innerHTML = listHtml(); }
// гость искал и ничего не нашёл - запомним (через 2,5 сек, когда перестал печатать): список для докупки песен
let missTimer = null;
function noteMiss(q){
  clearTimeout(missTimer);
  const k = norm(q);
  if (k.length < 3 || /^[0-9 ]+$/.test(k) || PS.missSent.has(k) || !PS.token) return;
  missTimer = setTimeout(() => {
    if (norm(PS.q) !== k || PS.mode !== "all") return;
    PS.missSent.add(k); call("miss", { q: String(q).trim().slice(0, 60) });
  }, 2500);
}

// «Мои песни» (сборка 7): переключатель «Список» / «Избранное». Один список на зал и кабинки.
function zonePill(ast){ return inCabin() ? "" : (ast ? '<span class="sg-zone">зал и кабинка</span>' : '<span class="sg-zone cab">только кабинка</span>'); }
function srcBadge(yt){ return '<span class="sg-src' + (yt ? " yt" : "") + '">' + (yt ? "YT" : "файл") + "</span>"; }
const favxKey = (t, a, yt) => yt ? "yt:" + yt : "l:" + String(t || "").trim().toLowerCase() + "|" + String(a || "").trim().toLowerCase();
function favxOf(t, a, yt){ const k = favxKey(t, a, yt); return ((PS.me && PS.me.favx) || []).find(f => favxKey(f.t, f.a, f.yt) === k) || null; }
function xRow(t, a, yt, under){        // песня не из AST: YouTube или файл кабинки
  const fx = favxOf(t, a, yt);
  const v = cleanYt(t, a);   // «Sherali Jo'rayev - Gulbadan» + канал «Milliy Karaoke» -> исполнитель и название отдельно
  return '<div class="sg-row">' + srcBadge(yt) + '<div class="sg-t"><b>' + esc(v.t) + "</b><span>" + esc(v.a) + "</span>" + zonePill(false) + (under || "") + "</div>" +
    '<button type="button" class="sg-ic' + (fx ? " on" : "") + '" data-fx="1" data-t="' + esc(t) + '" data-a="' + esc(a) + '" data-yt="' + esc(yt || "") + '" aria-label="' + (fx ? "Убрать из избранного" : "В избранное") + '">' + STAR + "</button>" +
    (inCabin() ? "<span></span>" : '<span class="sg-cabtxt">в кабинке</span>') + "</div>";
}
function cabinBanner(){
  const me = PS.me; if (!me || !me.cabin) return "";
  return '<div class="sg-cab"><div class="top"><b>Вы в Кабинке ' + me.cabin + '</b><span>список уже на экране</span></div>' +
    '<p>Нажмите «Открыть в кабинке» - плеер поднимет ваш список наверх.</p>' +
    '<div class="two"><button type="button" class="sg-btn full" id="sg-copen">Открыть в кабинке</button><button type="button" class="sg-btn ghost" id="sg-ccode">Код для входа</button></div>' +
    '<div id="sg-cbox">' + codeBox() + "</div></div>";
}
function codeBox(){
  const c = PS.ccode; if (!c) return "";
  const left = Math.max(0, Math.round((c.until - Date.now()) / 1000));
  if (!left) return '<div class="sg-cnote" style="margin-top:10px">Код истёк - возьмите новый</div>';
  return '<div class="sg-digits">' + String(c.code).split("").map(x => "<span>" + esc(x) + "</span>").join("") + "</div>" +
    '<div class="sg-cnote">Действует ещё ' + mmss(left) + " · номер ··· " + esc(c.tail || "") + '<br>Сели в кабинку по брони друзей? На экране кабинки - «+ Добавить друга», ваш номер и этот код.</div>';
}
function scrFav(){
  const me = PS.me || {};
  const my = myList(), favs = me.favs || [], favx = me.favx || [];
  if (!PS.fmode) PS.fmode = my.length || !(favs.length + favx.length) ? "list" : "fav";
  let h = cabinBanner() + '<div class="sg-chips">' +
    '<button type="button" class="' + (PS.fmode === "list" ? "on" : "") + '" data-fm="list">Список · ' + my.length + "</button>" +
    '<button type="button" class="' + (PS.fmode === "fav" ? "on" : "") + '" data-fm="fav">Избранное · ' + (favs.length + favx.length) + "</button></div>";
  if (!inCabin()) h += '<div class="sg-note">Один список на зал и кабинки. Песни с пометкой <b>только кабинка</b> (YouTube, файлы кабинки) в зале не ставятся - они откроются на экране кабинки.</div>';
  h += orderNote();
  if (PS.fmode === "list"){
    if (!me.my) h += '<div class="sg-empty"><b>Загрузка…</b></div>';
    else if (!my.length) h += '<div class="sg-empty"><b>Список пока пуст</b>В каталоге нажмите «В мой список» под песней - соберите песни на вечер. Порядок можно менять.</div>';
    else h += my.map((x, i) => {
      const under = (i > 0 ? '<button type="button" class="sg-wbtn" data-mlup="' + x.id + '">Выше</button>' : "") + '<button type="button" class="sg-wbtn" data-mldel="' + x.id + '">Убрать</button>';
      if (x.song_no > 0) return songRow(x.song_no, x.title, x.artist, x.dur, "", false, (inCabin() ? "" : zonePill(true) + "<br>") + under);
      return xRow(x.title, x.artist, x.ytId, "<br>" + under);
    }).join("");
  } else {
    if (!favs.length && !favx.length) h += '<div class="sg-empty"><b>Пока пусто</b>Отмечайте песни звёздочкой в каталоге или на экране кабинки - соберите список дома, а в зале заказывайте в одно касание</div>';
    h += favs.map(f => songRow(f[0], f[1], f[2], f[3])).join("");
    h += favx.map(f => xRow(f.t, f.a, f.yt)).join("");
  }
  h += '<button type="button" class="sg-ytadd" id="sg-ytopen">+ Добавить с YouTube (для кабинки)</button>';
  return h;
}
// История: что пел гость и когда - по вечерам, у каждой песни время и лайки зала
function histDay(d){
  const dt = new Date(d + "T12:00:00"), now = new Date();
  const biz = new Date(now.getTime() - 5 * 3600e3);   // вечер до 05:00 - ещё «сегодня»
  const key = x => x.getFullYear() + "-" + x.getMonth() + "-" + x.getDate();
  const y = new Date(biz.getTime() - 864e5);
  const opt = { day: "numeric", month: "long", weekday: "short" };
  if (dt.getFullYear() !== biz.getFullYear()) opt.year = "numeric";
  const txt = dt.toLocaleDateString("ru-RU", opt);
  return key(dt) === key(biz) ? "Сегодня, " + txt : key(dt) === key(y) ? "Вчера, " + txt : txt;
}
function scrHist(){
  const me = PS.me || {};
  const hist = me.history || [];
  if (!hist.length) return '<div class="sg-empty"><b>Здесь будет ваша история</b>' + (me.reg ? "Что и когда вы спели в SPLETNI - появится тут после первой песни" : "Поделитесь номером во вкладке «Сегодня» - и мы покажем, что вы пели в прошлые визиты") + "</div>";
  const total = hist.reduce((s, v) => s + v.songs.length, 0);
  let h = '<div class="sg-hsum">' + total + " " + plural(total, "песня", "песни", "песен") + " за " + hist.length + " " + plural(hist.length, "вечер", "вечера", "вечеров") + (hist.length >= 20 ? " (последние)" : "") + "</div>";
  hist.forEach(v => {
    h += '<div class="sg-hday"><b>' + histDay(v.date) + "</b><span>стол " + v.table_no + " · " + v.songs.length + " " + plural(v.songs.length, "песня", "песни", "песен") + "</span></div>";
    h += '<button type="button" class="sg-cbtn" data-card="' + esc(v.date) + '">Карточка вечера для сторис</button>';
    h += v.songs.map(x => songRow(x[0], x[1], x[2], 0, (x[4] ? " · в " + x[4] : "") + (x[5] ? " · ♥ " + x[5] : ""), true)).join("");
  });
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
    (tb ? "" : '<div class="sub" style="margin-top:6px">Голосуют гости за столами Большого зала - поделитесь номером в «Сегодня».</div>') + "</div>";
}
function pollBanner(){
  const pl = PS.me && PS.me.poll; if (!pl || PS.tab === "table") return "";
  return '<button type="button" class="sg-pb" data-tab="table">Идёт голосование: ' + esc(pl.title) + "<span>голосовать →</span></button>";
}
// где гость сегодня - для шапки «Песни» (сборка 8)
function headWhere(tb){
  const me = PS.me || {};
  if (tb) return "Большой зал · стол " + tb.table_no;
  if (me.cabin) return "Кабинка " + me.cabin;
  if (me.cab_bk) return "Кабинка " + me.cab_bk.cabin + (me.cab_bk.at ? " · сегодня в " + me.cab_bk.at : " · сегодня");
  return "Зал и кабинки";
}
function scrTable(){
  const me = PS.me;
  if (!me) return '<div class="sg-empty"><b>Загрузка…</b></div>';
  const tb = me.table;
  let h = pollBlock();
  if (!tb && me.cabin){      // гость сидит в кабинке (сборка 7)
    return h + cabinBanner() + '<div class="sg-note">Песни в кабинке ставятся на экране плеера. Здесь - ваш список и код для входа. Список и избранное - во вкладке «Мои песни».</div>';
  }
  if (!me.reg && !tb){
    h += '<div class="sg-card"><div style="font-weight:800;font-size:16px;margin-bottom:6px">Заказ песен на свой стол</div>' +
      '<div style="color:var(--muted);font-size:13.5px;line-height:1.5">Поделитесь номером Telegram - мы найдём вашу бронь в Большом зале или в кабинке. В зале - заказ песен на стол и очередь, в кабинке - ваш список сразу на экране.</div>' +
      '<button type="button" class="sg-btn" id="sg-share">Поделиться номером</button><div id="sg-share-msg"></div></div>';
    h += '<div class="sg-sec">Есть код стола от друга?</div><div class="sg-in"><input id="sg-code" maxlength="8" placeholder="Например K7Q2MX" autocomplete="off" aria-label="Код стола"><button type="button" id="sg-join">Войти</button></div><div id="sg-join-msg"></div>';
    return h;
  }
  if (!tb && me.cab_bk){      // бронь в кабинке, ещё не сели (сборка 8)
    const cb = me.cab_bk;
    h += '<div class="sg-card"><div style="font-weight:800;font-size:16px">Ваша бронь: Кабинка ' + cb.cabin + ', сегодня' + (cb.at ? " в " + esc(cb.at) : "") + '</div>' +
      '<div style="color:var(--muted);font-size:13.5px;margin-top:6px;line-height:1.5">Когда хостес отметит посадку, ваш список и избранное сразу появятся на экране кабинки. Соберите песни заранее - во вкладке «Мои песни».</div>' +
      '<button type="button" class="sg-btn" id="sg-gofav">Мои песни</button>' +
      (cb.role === "owner" ? '<button type="button" class="sg-btn ghost" id="sg-goinv" data-bk="' + esc(cb.booking) + '">Позвать компанию</button>' : "") + "</div>";
    return h;
  }
  if (!tb){                   // брони на сегодня нет (сборка 8: зал и кабинки)
    h += '<div class="sg-card"><div style="font-weight:800">На сегодня брони не нашли</div><div style="color:var(--muted);font-size:13.5px;margin-top:4px;line-height:1.5">Ищем по номеру ' + esc(me.phone || "") + ' - в Большом зале и в кабинках. Если бронь на другой номер - попросите того, на кого бронь, добавить вас, или введите код стола.</div></div>';
    h += '<div class="sg-card"><div style="font-weight:800">В Большом зале</div><div style="color:var(--muted);font-size:13.5px;margin-top:4px;line-height:1.5">Заказ песен на свой стол, очередь зала и примерное время до вашей песни.</div></div>';
    h += '<div class="sg-card"><div style="font-weight:800">В кабинке</div><div style="color:var(--muted);font-size:13.5px;margin-top:4px;line-height:1.5">Ваш список сразу на экране, друзья входят по своему номеру. Песни можно собрать заранее во вкладке «Мои песни».</div></div>';
    h += '<button type="button" class="sg-btn" id="sg-gobook">Забронировать</button>';
    h += '<div class="sg-sec">Код стола от друга</div><div class="sg-in"><input id="sg-code" maxlength="8" placeholder="Например K7Q2MX" autocomplete="off" aria-label="Код стола"><button type="button" id="sg-join">Войти</button></div><div id="sg-join-msg"></div>';
    return h;
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
      (x.skip ? '<br><span class="sg-tag">вне очереди</span>' : "") +
      ((x.wish || []).length ? "<br>" + x.wish.map(w => '<span class="sg-w">' + esc((WISH[w] || w).toLowerCase()) + "</span>").join("") : "") +
      ((x.by_me || tb.role === "owner") ? '<br><button type="button" class="sg-wbtn" data-wish="' + x.id + '">' + ((x.wish || []).length ? "Изменить пожелание" : "Пожелание звукооператору") + "</button>" : "") +
      "</div><span></span>" +
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
    h += '<div class="sg-sec">Добавить друга за стол</div><div style="font-size:13px;color:var(--muted);line-height:1.45">Друг сможет заказывать песни на ваш стол - в общий лимит стола (' + tb.limit + ' ' + plural(tb.limit, "песня", "песни", "песен") + '). Доступ до конца вечера.</div>' +
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

/* ---------- «Позвать компанию» (сборка 9) ---------- */
const INV_ST = { yes: ["придёт", "yes"], no: ["не сможет", "no"], sent: ["ждём ответ", ""] };
const MON = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
function dm(d){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? (+m[3]) + " " + MON[+m[2] - 1] : ""; }
function scrInvite(){
  let h = '<button type="button" class="sg-back" id="sg-invback">← Назад к песням</button>' +
    '<div class="sg-h"><h2>Позвать компанию</h2></div>';
  if (PS.invErr) return h + '<div class="sg-empty"><b>' + esc(errText(PS.invErr)) + "</b></div>";
  const d = PS.invData;
  if (!d) return h + '<div class="sg-empty"><b>Загрузка…</b></div>';
  const b = d.booking || {}, fr = d.friends || [];
  h += '<div class="sg-card"><div style="font-weight:800;font-size:16px">' + esc(b.place) + "</div>" +
    '<div style="color:var(--muted);font-size:13.5px;margin-top:4px">' + esc(b.when) + (b.guests ? " · " + b.guests + " " + plural(b.guests, "гость", "гостя", "гостей") : "") + "</div></div>";
  if (!fr.length) return h + '<div class="sg-note">Пока не с кем: здесь появятся друзья, с которыми вы были в SPLETNI и кого добавляли к брони.</div>';
  const can = fr.filter(f => f.bot && !f.status), sent = fr.filter(f => f.status), nobot = fr.filter(f => !f.bot && !f.status);
  const yes = sent.filter(f => f.status === "yes").length;
  if (sent.length) h += '<div class="sg-sec">Приглашены <span>придут: ' + yes + " из " + sent.length + "</span></div>" +
    sent.map(f => { const st = INV_ST[f.status] || ["", ""]; return '<div class="sg-fr"><span><b>' + esc(f.name) + "</b></span><span class=\"st " + st[1] + '">' + st[0] + "</span></div>"; }).join("");
  if (can.length){
    h += '<div class="sg-sec">' + (sent.length ? "Позвать ещё" : "Та же компания") + ' <span><button type="button" class="sg-back" id="sg-invall" style="margin:0">' + (can.every(f => PS.invSel.has(f.tg)) ? "Снять всех" : "Выбрать всех") + "</button></span></div>";
    h += can.map(f => '<button type="button" class="sg-fr' + (PS.invSel.has(f.tg) ? " on" : "") + '" data-fr="' + esc(f.tg) + '"><span><b>' + esc(f.name) + "</b><small>" +
      f.times + " " + plural(f.times, "вечер", "вечера", "вечеров") + " вместе" + (f.last ? " · последний " + dm(f.last) : "") + "</small></span><span></span></button>").join("");
    const n = can.filter(f => PS.invSel.has(f.tg)).length;
    h += '<button type="button" class="sg-btn" id="sg-invsend"' + (n ? "" : " disabled") + ">Отправить приглашения" + (n ? " · " + n : "") + "</button>" +
      '<div class="sg-note" style="margin-top:10px">Бот пришлёт каждому приглашение от вашего имени. Кто ответит «Приду» - ' +
      (b.cabin ? "сразу появится на экране кабинки." : "сможет заказывать песни на ваш стол.") + " Ответы придут вам в бот.</div>";
  }
  if (nobot.length){
    h += '<div class="sg-sec">Нет в боте SPLETNI</div>' +
      nobot.map(f => '<div class="sg-fr off"><span><b>' + esc(f.name) + "</b><small>бот не может им написать</small></span><span></span></div>").join("") +
      '<button type="button" class="sg-btn ghost" id="sg-invshare">Поделиться ссылкой</button>';
  }
  return h;
}
async function loadInv(){
  PS.invErr = ""; PS.invData = null; render();
  const d = await call("my_inv_list", { booking: PS.inv });
  if (d.error) PS.invErr = d.error; else PS.invData = d;
  render();
}
async function sendInv(btn){
  const tgs = [...PS.invSel]; if (!tgs.length) return;
  btn.disabled = true;
  const d = await call("my_inv_send", { booking: PS.inv, tgs });
  if (d.error){ toast(errText(d.error)); haptic("error"); btn.disabled = false; return; }
  haptic("success"); toast(d.sent ? "Отправили " + d.sent + " " + plural(d.sent, "приглашение", "приглашения", "приглашений") + ". Ответы придут вам в бот" : "Этим друзьям приглашение уже отправлено");
  PS.invSel.clear(); PS.invData = d; render();
}
function render(){
  const sec = SEC(); if (!sec) return;
  if (PS.err === "no_tg" || PS.err === "bad_init_data" || PS.err === "test_mode"){
    sec.innerHTML = '<div class="sg-h"><h2>Песни</h2></div><div class="sg-empty"><b>' + esc(errText(PS.err)) + "</b>Каталог песен и заказ на стол работают внутри Telegram</div>";
    return;
  }
  if (PS.inv){ sec.innerHTML = scrInvite(); sec.dataset.tab = "inv"; return; }
  const tb = table();
  const qn = PS.me ? (PS.me.mine || []).filter(x => x.status === "queued").length : 0;
  const active = document.activeElement && document.activeElement.id;
  const keepScroll = window.scrollY;
  let body = PS.tab === "cat" ? scrCat() : PS.tab === "fav" ? scrFav() : PS.tab === "hist" ? scrHist() : scrTable();
  const head = '<div class="sg-h"><h2>Песни</h2><span>' + headWhere(tb) + "</span></div>" +
    '<div class="sg-tabs" role="tablist">' +
    '<button type="button" data-tab="cat" class="' + (PS.tab === "cat" ? "on" : "") + '"><span class="tl">Каталог</span></button>' +
    '<button type="button" data-tab="fav" class="' + (PS.tab === "fav" ? "on" : "") + '"><span class="tl">Мои песни</span></button>' +
    '<button type="button" data-tab="hist" class="' + (PS.tab === "hist" ? "on" : "") + '"><span class="tl">История</span></button>' +
    '<button type="button" data-tab="table" class="' + (PS.tab === "table" ? "on" : "") + '"><span class="tl">' + "Сегодня" + "</span>" + (tb && qn ? '<span class="sg-badge">' + qn + "</span>" : "") + "</button></div>" +
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
async function addSong(n, wish){
  const s = songData(n) || findInMe(n);
  if (!s) return;
  const d = await call("add", { n: s.n, t: s.t, a: s.a, d: s.d, wish: wish || [] });
  if (d.error){ toast(errText(d.error)); haptic("error"); }
  else { haptic("success"); toast("На столе! Ваша песня примерно через " + Math.max(1, Math.round((d.eta || 0) / 60)) + " мин"); }
  await refresh();
}
function findInMe(n){
  const me = PS.me || {};
  const f = (me.favs || []).find(x => x[0] === n) || (me.top || []).find(x => x[0] === n);
  if (f) return { n: f[0], t: f[1], a: f[2], d: f[3] };
  for (const v of (me.history || [])) for (const x of v.songs) if (x[0] === n) return { n: x[0], t: x[1], a: x[2], d: x[3] };
  for (const c of (me.colls || [])) for (const x of (c.songs || [])) if (x[0] === n) return { n: x[0], t: x[1], a: x[2], d: x[3] };
  const m = (me.my || []).find(x => x.song_no === n);
  if (m) return { n, t: m.title, a: m.artist, d: m.dur || 240 };
  return null;
}

/* ---------- «Мои песни»: список, избранное YouTube, кабинка (сборка 7) ---------- */
async function myCall(action, args, okMsg){
  const d = await call(action, args);
  if (d.error){ toast(errText(d.error)); haptic("error"); return d; }
  if (d.list && PS.me) PS.me.my = d.list;
  if (okMsg){ haptic("success"); toast(okMsg); }
  render();
  return d;
}
function toggleMy(n){
  const ex = inMy(n);
  if (ex) return myCall("my_del", { id: ex.id }, "Убрано из списка");
  const s = songData(n) || findInMe(n); if (!s) return;
  return myCall("my_add", { song_no: s.n, title: s.t, artist: s.a, dur: s.d }, "Добавлено в мой список");
}
function moveUp(id){
  const ids = myList().map(x => x.id), i = ids.indexOf(id);
  if (i < 1) return;
  [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
  const byId = new Map(myList().map(x => [x.id, x]));
  PS.me.my = ids.map(x => byId.get(x)); render();
  myCall("my_move", { ids });
}
async function toggleFx(t, a, yt){
  const fx = favxOf(t, a, yt);
  const d = await call("my_fav", fx ? { k: fx.k } : { title: t, artist: a, ytId: yt || undefined, add: true });
  if (d.error){ toast(errText(d.error)); haptic("error"); }
  else { haptic("success"); toast(d.fav ? "Добавлено в избранное" : "Убрано из избранного"); }
  await refresh();
}
let codeTimer = null;
async function cabinCode(){
  const d = await call("cabin_code");
  if (d.error){ toast(d.retryIn ? "Новый код можно взять через " + d.retryIn + " сек" : errText(d.error)); return; }
  PS.ccode = { code: d.code, tail: d.tail, until: Date.now() + (d.expiresIn || 300) * 1000 };
  haptic("success");
  const tick = () => { const b = document.getElementById("sg-cbox"); if (b) b.innerHTML = codeBox(); if (!PS.ccode || Date.now() > PS.ccode.until){ clearInterval(codeTimer); codeTimer = null; } };
  clearInterval(codeTimer); codeTimer = setInterval(tick, 1000); tick();
}
// добавление с YouTube: ссылка -> id видео, название подтягиваем из YouTube (oEmbed), гость может поправить
function ytId(s){
  s = String(s || "").trim();
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null;
}
function cleanYt(title, author){
  let t = String(title || "").replace(/\s*[(\[][^)\]]*(karaoke|караоке|минус|instrumental|lyrics|текст|official|клип|video|audio)[^)\]]*[)\]]/gi, "").replace(/\s*\|.*$/, "").trim();
  let a = "";
  const p = t.split(/\s+[-–—]\s+/);
  if (p.length >= 2){ a = p.shift().trim(); t = p.join(" - ").trim(); }
  else a = String(author || "").replace(/\s*-\s*topic$/i, "").trim();
  return { t: t || String(title || ""), a };
}
async function ytInfo(id){
  const u = encodeURIComponent("https://www.youtube.com/watch?v=" + id);
  for (const url of ["https://www.youtube.com/oembed?format=json&url=" + u, "https://noembed.com/embed?url=" + u]){
    try{ const r = await fetch(url); if (!r.ok) continue; const j = await r.json(); if (j && j.title) return cleanYt(j.title, j.author_name); }catch(_){}
  }
  return null;
}
function openYt(){
  PS.sheet = { mode: "yt", id: null };
  const el = document.getElementById("sg-sheet");
  el.innerHTML = '<div class="sg-sh" role="dialog" aria-modal="true" aria-label="Добавить с YouTube">' +
    '<div style="font-size:18px;font-weight:800">Добавить с YouTube</div>' +
    '<label>Ссылка на видео<input id="sg-ytl" type="url" inputmode="url" placeholder="youtu.be/…" autocomplete="off"></label>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:5px">В приложении YouTube: «Поделиться» - «Копировать ссылку»</div>' +
    '<div id="sg-ytm"></div>' +
    '<label>Название<input id="sg-ytt" type="text" maxlength="200" autocomplete="off"></label>' +
    '<label>Исполнитель<input id="sg-yta" type="text" maxlength="200" autocomplete="off"></label>' +
    '<div class="sg-note warn" style="margin-top:12px">Песни с YouTube поются только в кабинках. В Большом и Малом залах - только каталог AST.</div>' +
    '<div class="acts two"><button type="button" class="sg-btn" id="sg-ytlist">В мой список</button><button type="button" class="sg-btn ghost" id="sg-ytfav">В избранное</button></div>' +
    '<button type="button" class="sg-btn ghost" id="sg-shx">Отмена</button></div>';
  el.hidden = false;
  setTimeout(() => { const i = document.getElementById("sg-ytl"); if (i) i.focus(); }, 50);
}
let ytTimer = null;
function onSheetInput(e){
  if (e.target.id !== "sg-ytl" || !PS.sheet || PS.sheet.mode !== "yt") return;
  clearTimeout(ytTimer);
  ytTimer = setTimeout(async () => {
    const id = ytId(e.target.value), m = document.getElementById("sg-ytm");
    PS.sheet.id = id;
    if (!m) return;
    if (!id){ m.innerHTML = e.target.value.trim() ? '<div class="sg-msg">Это не похоже на ссылку YouTube</div>' : ""; return; }
    m.innerHTML = '<div class="sg-msg ok">Ищем название…</div>';
    const info = await ytInfo(id);
    if (!PS.sheet || PS.sheet.id !== id) return;
    const ti = document.getElementById("sg-ytt"), ai = document.getElementById("sg-yta");
    if (info){ if (ti && !ti.value) ti.value = info.t; if (ai && !ai.value) ai.value = info.a; m.innerHTML = '<div class="sg-msg ok">Видео найдено - проверьте название и исполнителя</div>'; }
    else m.innerHTML = '<div class="sg-msg ok">Ссылка принята. Впишите название и исполнителя</div>';
  }, 350);
}
async function ytSave(kind){
  const sh = PS.sheet; if (!sh) return;
  const l = document.getElementById("sg-ytl"), t = (document.getElementById("sg-ytt").value || "").trim(), a = (document.getElementById("sg-yta").value || "").trim();
  const id = ytId(l && l.value);
  if (!id){ toast("Вставьте ссылку на видео YouTube"); return; }
  if (!t){ toast(errText("bad_song")); return; }
  closeSheet();
  if (kind === "list"){ PS.fmode = "list"; await myCall("my_add", { ytId: id, title: t, artist: a }, "Добавлено в мой список - откроется в кабинке"); }
  else { const d = await call("my_fav", { ytId: id, title: t, artist: a, add: true }); if (d.error) toast(errText(d.error)); else { haptic("success"); toast("Добавлено в избранное"); PS.fmode = "fav"; } await refresh(); }
}

/* ---------- окно заказа: пожелание звукооператору + «сегодня уже пели» ---------- */
function openSheet(o){
  const s = o.mode === "edit" ? o.item : (songData(o.n) || findInMe(o.n));
  if (!s) return;
  PS.sheet = { mode: o.mode, n: s.n, id: o.mode === "edit" ? o.item.id : null, wish: new Set(o.mode === "edit" ? (o.item.wish || []) : []) };
  const r = o.mode === "add" ? tonight(s.n) : null;
  const el = document.getElementById("sg-sheet");
  el.innerHTML = '<div class="sg-sh" role="dialog" aria-modal="true" aria-label="' + (o.mode === "add" ? "Поставить песню на стол" : "Пожелание к песне") + '">' +
    '<div class="hd"><span class="sg-num">' + s.n + '</span><div class="sg-t"><b>' + esc(s.t) + "</b><span>" + esc(s.a) + "</span></div></div>" +
    (r ? '<div class="sg-note warn">' + (r.s === "q" ? "Эта песня уже в очереди зала (стол " + r.t + ")." : "Эту песню сегодня уже пели" + (r.at ? " в " + r.at : "") + " (стол " + r.t + ").") + " Можно поставить и ещё раз.</div>" : "") +
    '<div class="lb">Пожелание звукооператору · необязательно</div><div class="sg-wch" id="sg-wch">' + wishChips() + "</div>" +
    '<div class="acts"><button type="button" class="sg-btn" id="sg-shok">' + (o.mode === "add" ? "Поставить на стол" : "Сохранить пожелание") + '</button><button type="button" class="sg-btn ghost" id="sg-shx">Отмена</button></div></div>';
  el.hidden = false;
}
function wishChips(){
  return Object.keys(WISH).map(k => '<button type="button" data-w="' + k + '" class="' + (PS.sheet.wish.has(k) ? "on" : "") + '" aria-pressed="' + PS.sheet.wish.has(k) + '">' + WISH[k] + "</button>").join("");
}
function closeSheet(){ PS.sheet = null; const el = document.getElementById("sg-sheet"); if (el){ el.hidden = true; el.innerHTML = ""; } }
async function onSheetClick(e){
  const t = e.target, sh = PS.sheet;
  if (!sh) return;
  if (t.id === "sg-sheet" || t.closest("#sg-shx")){ closeSheet(); return; }
  if (sh.mode === "yt"){
    if (t.closest("#sg-ytlist")) ytSave("list"); else if (t.closest("#sg-ytfav")) ytSave("fav");
    return;
  }
  const w = t.closest("[data-w]");
  if (w){
    const k = w.dataset.w;
    if (sh.wish.has(k)) sh.wish.delete(k); else { sh.wish.add(k); if (WISH_PAIR[k]) sh.wish.delete(WISH_PAIR[k]); }
    document.getElementById("sg-wch").innerHTML = wishChips(); return;
  }
  const ok = t.closest("#sg-shok");
  if (ok && !ok.disabled){
    ok.disabled = true;
    const wish = [...sh.wish];
    if (sh.mode === "add"){ closeSheet(); await addSong(sh.n, wish); return; }
    const d = await call("wish", { id: sh.id, wish });
    closeSheet();
    if (d.error) toast(errText(d.error)); else { haptic("success"); toast(wish.length ? "Звукооператор увидит: " + wishTxt(wish) : "Пожелание убрано"); }
    refresh();
  }
}

/* ---------- карточка вечера для сторис ---------- */
const CARD_W = 1080, CARD_H = 1920, CARD_FONT = '"Segoe UI", Roboto, -apple-system, BlinkMacSystemFont, Arial, sans-serif';
function fitText(ctx, txt, max){
  txt = String(txt || "");
  if (ctx.measureText(txt).width <= max) return txt;
  while (txt.length > 1 && ctx.measureText(txt + "…").width > max) txt = txt.slice(0, -1);
  return txt.trimEnd() + "…";
}
function spaced(ctx, txt, x, y, gap, align){
  // текст с разрядкой (для логотипа и подписей)
  const w = [...txt].reduce((s, ch) => s + ctx.measureText(ch).width + gap, -gap);
  let cx = align === "center" ? x - w / 2 : x;
  const old = ctx.textAlign; ctx.textAlign = "left";
  for (const ch of txt){ ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + gap; }
  ctx.textAlign = old;
}
function rrect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function heart(ctx, x, y, s){
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 24, s / 24);
  ctx.fill(new Path2D("M12 20.3l-1.3-1.2C6 14.9 3 12.2 3 8.8 3 6.1 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.1 21 8.8c0 3.4-3 6.1-7.7 10.3z"));
  ctx.restore();
}
function drawCard(v){
  const cv = document.createElement("canvas"); cv.width = CARD_W; cv.height = CARD_H;
  const c = cv.getContext("2d");
  const GOLD = "#c9a14a", EM = "#1fbf7a", PINK = "#ff8fb0", TXT = "#eef1f4", MUT = "#9aa3ad";
  c.fillStyle = "#0b0d10"; c.fillRect(0, 0, CARD_W, CARD_H);
  let g = c.createRadialGradient(140, 260, 0, 140, 260, 900); g.addColorStop(0, "rgba(31,191,122,.30)"); g.addColorStop(1, "rgba(31,191,122,0)");
  c.fillStyle = g; c.fillRect(0, 0, CARD_W, CARD_H);
  g = c.createRadialGradient(980, 1700, 0, 980, 1700, 1000); g.addColorStop(0, "rgba(201,161,74,.26)"); g.addColorStop(1, "rgba(201,161,74,0)");
  c.fillStyle = g; c.fillRect(0, 0, CARD_W, CARD_H);
  g = c.createRadialGradient(900, 700, 0, 900, 700, 700); g.addColorStop(0, "rgba(255,111,154,.12)"); g.addColorStop(1, "rgba(255,111,154,0)");
  c.fillStyle = g; c.fillRect(0, 0, CARD_W, CARD_H);
  c.textBaseline = "alphabetic";
  // логотип: замочная скважина + SPLETNI
  c.fillStyle = TXT;
  c.save(); c.translate(CARD_W / 2 - 41, 120); c.scale(.82, .82);
  c.beginPath(); c.arc(50, 38, 20, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(42, 50); c.lineTo(58, 50); c.lineTo(64, 82); c.lineTo(36, 82); c.closePath(); c.fill();
  c.restore();
  c.font = "800 66px " + CARD_FONT; spaced(c, "SPLETNI", CARD_W / 2, 272, 16, "center");
  c.fillStyle = MUT; c.font = "600 30px " + CARD_FONT; spaced(c, "КАРАОКЕ · ТАШКЕНТ", CARD_W / 2, 322, 8, "center");
  // дата
  const dt = new Date(v.date + "T12:00:00");
  c.fillStyle = GOLD; c.font = "800 38px " + CARD_FONT; spaced(c, "МОЙ ВЕЧЕР", CARD_W / 2, 470, 10, "center");
  c.fillStyle = TXT; c.font = "900 118px " + CARD_FONT; c.textAlign = "center";
  c.fillText(dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }), CARD_W / 2, 600);
  c.fillStyle = MUT; c.font = "600 44px " + CARD_FONT;
  c.fillText(dt.toLocaleDateString("ru-RU", { weekday: "long" }) + (dt.getFullYear() !== new Date().getFullYear() ? " · " + dt.getFullYear() : ""), CARD_W / 2, 666);
  // цифры вечера
  const songs = v.songs || [], likes = songs.reduce((sum, x) => sum + (x[5] || 0), 0);
  const boxes = [[String(songs.length), plural(songs.length, "песня", "песни", "песен"), TXT], [String(likes), plural(likes, "лайк зала", "лайка зала", "лайков зала"), PINK], [String(v.table_no), "стол", GOLD]];
  const bw = 296, gap = 26, bx0 = (CARD_W - (bw * 3 + gap * 2)) / 2;
  boxes.forEach((b, i) => {
    const x = bx0 + i * (bw + gap), y = 740;
    rrect(c, x, y, bw, 220, 28); c.fillStyle = "rgba(255,255,255,.045)"; c.fill(); c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 2; c.stroke();
    c.fillStyle = b[2]; c.font = "900 104px " + CARD_FONT; c.textAlign = "center";
    if (i === 1){ const tw = c.measureText(b[0]).width; heart(c, x + bw / 2 - tw / 2 - 58, y + 70, 50); c.fillText(b[0], x + bw / 2 + 30, y + 128); }
    else c.fillText(b[0], x + bw / 2, y + 128);
    c.fillStyle = MUT; c.font = "600 34px " + CARD_FONT; c.fillText(b[1], x + bw / 2, y + 182);
  });
  // песни
  c.textAlign = "left";
  const best = Math.max(0, ...songs.map(x => x[5] || 0));
  c.fillStyle = MUT; c.font = "800 30px " + CARD_FONT; spaced(c, "ЧТО Я ПЕЛ(А)", 110, 1060, 7, "left");
  const show = songs.slice(0, songs.length > 6 ? 5 : 6);
  let y = 1140;
  show.forEach(x => {
    const isBest = best > 0 && (x[5] || 0) === best;
    if (isBest){ rrect(c, 84, y - 62, CARD_W - 168, 116, 22); c.fillStyle = "rgba(255,111,154,.10)"; c.fill(); c.strokeStyle = "rgba(255,111,154,.45)"; c.lineWidth = 2; c.stroke(); }
    c.fillStyle = GOLD; c.font = "800 36px " + CARD_FONT; c.fillText(x[4] || "", 110, y - 4);
    const lk = x[5] ? String(x[5]) : "";
    c.font = "800 38px " + CARD_FONT; const lkw = lk ? c.measureText(lk).width + 48 : 0;
    c.fillStyle = TXT; c.font = "800 46px " + CARD_FONT; c.fillText(fitText(c, x[1], CARD_W - 250 - 110 - lkw), 250, y - 4);
    c.fillStyle = MUT; c.font = "500 32px " + CARD_FONT; c.fillText(fitText(c, x[2], CARD_W - 250 - 110 - lkw), 250, y + 38);
    if (lk){ c.fillStyle = PINK; c.font = "800 38px " + CARD_FONT; c.textAlign = "right"; c.fillText(lk, CARD_W - 110, y + 10); heart(c, CARD_W - 110 - c.measureText(lk).width - 44, y - 22, 36); c.textAlign = "left"; }
    y += 132;
  });
  if (songs.length > show.length){ c.fillStyle = MUT; c.font = "700 34px " + CARD_FONT; c.fillText("и ещё " + (songs.length - show.length) + " " + plural(songs.length - show.length, "песня", "песни", "песен"), 250, y - 20); }
  // низ
  c.textAlign = "center"; c.fillStyle = TXT; c.font = "800 40px " + CARD_FONT; c.fillText("@spletni.bar", CARD_W / 2, 1800);
  c.fillStyle = MUT; c.font = "600 32px " + CARD_FONT; c.fillText("karaoketashkent.uz", CARD_W / 2, 1850);
  return cv.toDataURL("image/jpeg", 0.9);
}
function openCard(date){
  const hist = (PS.me && PS.me.history) || [];
  const v = date && date !== "last" ? hist.find(x => x.date === date) : hist[0];
  if (!v){ toast("Карточка появится после первой спетой песни"); return; }
  let img;
  try{ img = drawCard(v); }catch(e){ toast(errText("bad_image")); return; }
  PS.card = { img, date: v.date };
  const el = document.getElementById("sg-cardov");
  el.innerHTML = '<img alt="Карточка вечера ' + esc(v.date) + '" src="' + img + '">' +
    '<div class="t">Пришлём картинку вам в Telegram - сохраните её и выложите в сторис. Отметьте <b>@spletni.bar</b> - покажем в нашем аккаунте.</div>' +
    '<div class="row"><button type="button" class="sg-btn" id="sg-csend">Прислать в Telegram</button><button type="button" class="sg-btn ghost" id="sg-cx">Закрыть</button></div><div id="sg-cmsg"></div>';
  el.hidden = false;
}
async function onCardClick(e){
  const t = e.target;
  if (t.id === "sg-cardov" || t.closest("#sg-cx")){ const el = document.getElementById("sg-cardov"); el.hidden = true; el.innerHTML = ""; PS.card = null; return; }
  const b = t.closest("#sg-csend");
  if (b && !b.disabled && PS.card){
    b.disabled = true; b.textContent = "Отправляем…";
    const dt = new Date(PS.card.date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    if (!PS.token) await login();
    const d = await fn({ action: "card", token: PS.token, image: PS.card.img, caption: "Мой вечер в караоке SPLETNI · " + dt + "\nОтметьте @spletni.bar в сторис" });
    const m = document.getElementById("sg-cmsg");
    if (d.ok){ haptic("success"); b.textContent = "Готово - картинка в чате с ботом"; }
    else { b.disabled = false; b.textContent = "Прислать в Telegram"; if (m) m.innerHTML = '<div class="sg-msg" style="text-align:center">' + esc(errText(d.error === "http_404" ? "unknown_action" : d.error || "send")) + "</div>"; }
  }
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
  const more = t.closest("[data-more]"); if (more){ PS.limit += 60; renderList(); return; }
  const f = t.closest("[data-fav]"); if (f){ toggleFav(+f.dataset.fav); return; }
  // сборка 7: «Мои песни»
  const fm = t.closest("[data-fm]"); if (fm){ PS.fmode = fm.dataset.fm; render(); return; }
  const ml = t.closest("[data-ml]"); if (ml){ ml.disabled = true; toggleMy(+ml.dataset.ml); return; }
  const md = t.closest("[data-mldel]"); if (md){ md.disabled = true; myCall("my_del", { id: +md.dataset.mldel }, "Убрано из списка"); return; }
  const mu = t.closest("[data-mlup]"); if (mu){ moveUp(+mu.dataset.mlup); return; }
  const fx = t.closest("[data-fx]"); if (fx){ fx.disabled = true; toggleFx(fx.dataset.t, fx.dataset.a, fx.dataset.yt || null); return; }
  if (t.closest("#sg-ytopen")){ openYt(); return; }
  if (t.closest("#sg-gofav")){ PS.tab = "fav"; render(); window.scrollTo(0, 0); return; }
  // сборка 9: «Позвать компанию»
  const gi = t.closest("#sg-goinv"); if (gi){ PS.inv = gi.dataset.bk; PS.invSel.clear(); loadInv(); window.scrollTo(0, 0); return; }
  if (t.closest("#sg-invback")){ PS.inv = null; PS.invData = null; PS.invErr = ""; PS.invSel.clear(); PS.tab = "table"; render(); window.scrollTo(0, 0); return; }
  const fr = t.closest("[data-fr]"); if (fr){ const k = fr.dataset.fr; if (PS.invSel.has(k)) PS.invSel.delete(k); else PS.invSel.add(k); render(); return; }
  if (t.closest("#sg-invall")){ const can = ((PS.invData && PS.invData.friends) || []).filter(f => f.bot && !f.status); const all = can.every(f => PS.invSel.has(f.tg)); can.forEach(f => all ? PS.invSel.delete(f.tg) : PS.invSel.add(f.tg)); render(); return; }
  const isd = t.closest("#sg-invsend"); if (isd){ sendInv(isd); return; }
  if (t.closest("#sg-invshare")){
    const b = (PS.invData && PS.invData.booking) || {};
    const url = "https://t.me/share/url?url=" + encodeURIComponent("https://t.me/spletni_ai_bot") + "&text=" + encodeURIComponent("Идём в SPLETNI: " + (b.place || "") + ", " + (b.when || "") + ". Приходи! Открой бота SPLETNI - там песни, бронь и приглашения");
    try{ Telegram.WebApp.openTelegramLink(url); }catch(_){ window.open(url, "_blank"); }
    return;
  }
  if (t.closest("#sg-gobook")){ try{ if (typeof go === "function") go("book"); }catch(_){} return; }
  if (t.closest("#sg-copen")){ call("cabin_open").then(d => { if (d.error) toast(errText(d.error)); else { haptic("success"); toast("Ваш список поднят на экране Кабинки " + d.cabin); } }); return; }
  if (t.closest("#sg-ccode")){ cabinCode(); return; }
  const a = t.closest("[data-add]"); if (a && !a.disabled){ openSheet({ mode: "add", n: +a.dataset.add }); return; }
  const wb = t.closest("[data-wish]"); if (wb){ const it = ((PS.me && PS.me.mine) || []).find(x => x.id === +wb.dataset.wish); if (it) openSheet({ mode: "edit", item: it }); return; }
  const cb = t.closest("[data-card]"); if (cb){ openCard(cb.dataset.card); return; }
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
      box.innerHTML = '<div class="sg-code">' + esc(d.code) + '</div><div style="font-size:13px;color:var(--muted);line-height:1.45;text-align:center">Друг открывает приложение SPLETNI → «Песни» → «Сегодня» и вводит этот код. Код действует до конца вечера.</div>' +
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
    sec.addEventListener("keydown", e => { if (e.key === "Escape"){ closeSheet(); const co = document.getElementById("sg-cardov"); if (co && !co.hidden) co.querySelector("#sg-cx").click(); } if (e.key === "Enter" && e.target.id === "sg-code") document.getElementById("sg-join").click(); if (e.key === "Enter" && e.target.id === "sg-fphone") document.getElementById("sg-fadd").click(); }); }
  if (!PS.token){ try{ PS.token = sessionStorage.getItem("sg_token"); }catch(_){} }
  render();
  loadCat();
  if (!PS.token){ const ok = await login(); if (!ok){ render(); return; } }
  // ссылка-приглашение: startapp=stol-КОД
  const sp = PS.startParam || (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param);
  if (sp && /^stol-/i.test(sp) && !PS.joinedFromLink){ PS.joinedFromLink = true; await join(sp.slice(5)); }
  await refresh();
  if (PS.me && PS.me.table && !PS.openedOnce) PS.tab = "table";
  else if (PS.me && PS.me.cabin && !PS.openedOnce) PS.tab = "fav";   // сидит в кабинке - сразу «Мои песни»
  PS.openedOnce = true;
  if (PS.pendingCard && PS.me){ PS.tab = "hist"; render(); openCard(PS.pendingCard); PS.pendingCard = null; }
  if (PS.inv && !PS.invData && !PS.invErr) await loadInv();
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
  if (q.get("card")) PS.pendingCard = q.get("card");     // из сообщения бота после визита
  // «Не напоминать» под сообщением-напоминанием (сборка 7.3, 06.11.2026)
  if (q.get("noremind") === "1") call("my_noremind", { off: true }).then(d => {
    toast(d && d.ok ? "Хорошо, больше не будем напоминать" : "Не получилось - попробуйте ещё раз");
  });
  // сборка 9: «Позвать компанию» из сообщения бота (?invite=<бронь>) и ответ друга (?inv=<id>&a=yes|no|off)
  if (/^\d{1,18}$/.test(q.get("invite") || "")) PS.inv = q.get("invite");
  if (/^\d{1,18}$/.test(q.get("inv") || "") && ["yes", "no", "off"].includes(q.get("a"))) call("my_inv_answer", { inv: q.get("inv"), a: q.get("a") }).then(d => {
    if (!d || d.error){ toast(d && d.error ? errText(d.error) : "Не получилось - попробуйте ещё раз"); return; }
    if (d.off){ toast("Хорошо, приглашения больше присылать не будем"); return; }
    haptic("success");
    toast(d.answer === "yes" ? "Отлично! " + (d.owner || "Хозяин брони") + " узнает, что вы придёте: " + d.place + ", " + d.when : "Передали, что в этот раз не получится");
    refresh();
  });
  if (q.get("tab") === "songs" || q.get("card") || (sp && /^stol-/i.test(sp))) go("songs");
}
window.PesniInit = init;
document.addEventListener("visibilitychange", () => { if (!document.hidden && PS.poll && Date.now() - PS.lastMe > 5000) refresh(); });
window.PesniOpen = open;
window.PesniClose = close;
window.PesniState = PS;  // для отладки
})();
