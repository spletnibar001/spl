/* SPLETNI - заставка хоста: 3 варианта (A скважина, B часы, C неон), случайно при каждом включении.
   SplSaver.show({ onWake }) - показать; SplSaver.hide() - убрать. Касание/клавиша -> onWake() (там запрос PIN). */
(function(){
const KEY = "M441.0 434.8C441.0 434.1 448.2 405.8 457.0 372.1C465.8 338.3 472.8 310.6 472.7 310.5C470.1 309.4 462.7 303.4 458.7 299.0C448.6 288.2 444.0 276.0 444.0 260.5C444.0 244.2 449.1 231.9 460.5 220.5C471.8 209.2 484.2 204.0 500.0 204.0C515.8 204.0 528.2 209.2 539.5 220.5C550.9 231.9 556.0 244.2 556.0 260.5C556.0 276.0 551.4 288.2 541.3 299.0C537.3 303.4 529.9 309.4 527.3 310.5C527.2 310.6 534.2 338.3 543.0 372.1C551.8 405.8 559.0 434.1 559.0 434.8C559.0 435.7 546.5 436.0 500.0 436.0C453.5 436.0 441.0 435.7 441.0 434.8Z";
const WORD = "M135.0 626.0C120.8 624.2 108.2 618.2 99.7 609.2L95.8 605.2L100.5 590.4C103.1 582.2 105.4 575.3 105.6 575.1C105.8 574.9 109.0 577.6 112.8 581.1C125.1 592.5 137.1 596.6 151.1 594.2C162.4 592.3 168.2 588.5 168.2 583.3C168.2 577.5 158.8 573.7 142.0 572.5C117.9 570.9 99.8 560.7 92.3 544.6C89.9 539.3 89.5 537.3 89.5 529.5C89.6 517.9 92.4 511.4 101.0 503.0C122.3 482.1 164.9 481.7 186.6 502.2C193.1 508.3 193.1 506.7 186.9 526.1L182.8 539.0L176.0 532.6C172.0 528.9 166.4 524.8 162.5 522.9C156.6 520.0 154.4 519.5 146.5 519.2C135.8 518.7 127.9 520.5 123.1 524.6C114.0 532.2 126.4 541.0 146.3 541.0C162.4 541.1 178.9 547.8 188.8 558.4C197.1 567.3 199.3 573.4 198.8 585.5C198.4 592.9 197.9 595.5 195.6 600.0C186.3 618.1 160.3 629.2 135.0 626.0ZM216.0 558.0L216.0 491.0L252.3 491.0C292.3 491.0 294.9 491.3 307.0 497.2C316.0 501.6 328.5 514.2 332.8 523.1C340.8 539.7 341.1 556.2 333.5 572.7C325.0 591.2 308.8 603.9 289.8 607.0C286.3 607.5 275.1 608.0 264.8 608.0L246.0 608.0L246.0 616.5L246.0 625.0L231.0 625.0L216.0 625.0L216.0 558.0ZM355.0 557.5L355.0 490.0L370.5 490.0L386.0 490.0L386.0 542.0L386.0 594.0L421.5 594.0L457.0 594.0L457.0 609.5L457.0 625.0L406.0 625.0L355.0 625.0L355.0 557.5ZM478.0 557.5L478.0 490.0L532.5 490.0L587.0 490.0L587.0 505.5L587.0 521.0L548.2 521.2L509.5 521.5L509.2 535.7L508.9 550.0L540.7 550.2L572.5 550.5L572.5 565.5L572.5 580.5L540.8 580.8L509.0 581.0L509.0 587.5L509.0 594.0L548.0 594.0L587.0 594.0L587.0 609.5L587.0 625.0L532.5 625.0L478.0 625.0L478.0 557.5ZM653.0 573.0L653.0 521.0L631.0 521.0L609.0 521.0L609.0 505.5L609.0 490.0L668.5 490.0L728.0 490.0L728.0 505.5L728.0 521.0L706.0 521.0L684.0 521.0L684.0 573.0L684.0 625.0L668.5 625.0L653.0 625.0L653.0 573.0ZM746.0 557.5L746.0 490.0L759.8 490.0L773.6 490.0L797.6 525.5L821.5 561.0L821.8 525.5L822.0 490.0L837.5 490.0L853.0 490.0L853.0 557.5L853.0 625.0L839.2 625.0L825.4 625.0L801.5 587.9L777.5 550.9L777.2 587.9L777.0 625.0L761.5 625.0L746.0 625.0L746.0 557.5ZM880.2 557.8L880.5 490.5L895.8 490.2L911.0 489.9L911.0 557.5L911.0 625.0L895.5 625.0L880.0 625.0L880.2 557.8ZM290.3 575.0C312.7 566.6 314.1 535.5 292.6 524.2C287.5 521.5 287.3 521.5 267.0 521.5L246.5 521.5L246.2 548.0C246.1 562.6 246.2 575.0 246.5 575.7C246.8 576.7 251.5 577.0 265.9 577.0C282.6 577.0 285.6 576.7 290.3 575.0Z";
const VB = "60 180 880 470";
const css = `
.spls{position:fixed;inset:0;z-index:99999;overflow:hidden;cursor:none;user-select:none;font-family:Inter,Arial,sans-serif;animation:splsIn .8s ease}
@keyframes splsIn{from{opacity:0}to{opacity:1}}
.spls .hint{position:absolute;left:0;right:0;bottom:4vh;text-align:center;font-size:clamp(11px,1.1vw,15px);letter-spacing:.3em;opacity:.45;animation:splsHint 3s ease-in-out infinite}
@keyframes splsHint{50%{opacity:.15}}
.spls .tm{font-variant-numeric:tabular-nums}
.spls .tm i{font-style:normal;animation:splsColon 1s steps(1) infinite}@keyframes splsColon{50%{opacity:.2}}
/* A - скважина: свет из скважины, буквы проявляются */
.spls.a{background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.spls.a .beam{position:absolute;left:50%;top:50%;width:80vmin;height:80vmin;margin:-52vmin 0 0 -40vmin;border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.16) 0%,rgba(255,255,255,.05) 35%,transparent 65%);animation:splsBeam 6s ease-in-out infinite}
@keyframes splsBeam{50%{transform:scale(1.25);opacity:.55}}
.spls.a svg{width:min(62vw,620px);height:auto;position:relative}
.spls.a .k{animation:splsBreath 6s ease-in-out infinite;transform-origin:500px 310px;transform-box:view-box}
@keyframes splsBreath{50%{transform:scale(1.045)}}
.spls.a .w{animation:splsWord 9s ease-in-out infinite}
@keyframes splsWord{0%{opacity:0;letter-spacing:0}12%,85%{opacity:1}100%{opacity:0}}
.spls .tag{font-size:clamp(11px,1.15vw,15px);letter-spacing:.42em;margin-top:2.2vh;opacity:.7;white-space:nowrap}
.spls.b .tag{font-size:12px;letter-spacing:.38em;margin-top:12px;opacity:.75}
.spls.a .sub{margin-top:3vh;font-size:clamp(13px,1.5vw,20px);letter-spacing:.45em;opacity:.55}
/* B - часы: белый, блок плавает (защита монитора) */
.spls.b{background:#fff;color:#000}
.spls.b .blk{position:absolute;display:flex;flex-direction:column;align-items:center;animation:splsDriftX 47s linear infinite alternate,splsDriftY 31s linear infinite alternate}
@keyframes splsDriftX{from{left:4vw}to{left:calc(96vw - 520px)}}
@keyframes splsDriftY{from{top:6vh}to{top:calc(94vh - 380px)}}
.spls.b svg{width:300px;height:auto}
.spls.b .k{animation:splsPeek 8s ease-in-out infinite;transform-origin:500px 310px;transform-box:view-box}
@keyframes splsPeek{0%,70%,100%{transform:none}76%{transform:scaleY(.08)}82%{transform:none}}
.spls.b .clock{font:200 120px/1 Inter,Arial,sans-serif;letter-spacing:.02em;margin-top:6px;width:520px;text-align:center}
.spls.b .date{font-size:17px;color:#666;letter-spacing:.08em}
/* C - неон: контур рисуется, мерцает */
.spls.c{background:radial-gradient(circle at 50% 45%,#2a0607 0%,#000 70%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.spls.c svg{width:min(66vw,660px);height:auto;overflow:visible}
.spls.c path{fill:none;stroke:#ff3b41;stroke-width:5;stroke-linejoin:round;filter:url(#splsGlow)}
.spls.c .k{stroke-dasharray:1200;stroke-dashoffset:1200;animation:splsDraw 2.4s ease forwards,splsFlick 7s 2.4s infinite}
.spls.c .w{opacity:0;animation:splsOn .2s 1.6s forwards,splsFlick 5.3s 3s infinite}
@keyframes splsDraw{to{stroke-dashoffset:0}}
@keyframes splsOn{0%{opacity:0}30%{opacity:1}50%{opacity:.2}100%{opacity:1}}
@keyframes splsFlick{0%,91%,95%,100%{opacity:1}92%{opacity:.25}93%{opacity:.9}94%{opacity:.35}}
.spls.c .sub{margin-top:3vh;font-size:clamp(11px,1.2vw,16px);letter-spacing:.42em;opacity:.6;text-shadow:0 0 10px #E3262B}
.spls.c .tm{position:absolute;top:4vh;right:4vw;font-size:clamp(16px,2vw,28px);opacity:.55;letter-spacing:.1em}
`;
const WD = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
const MON = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
let el = null, tick = null, last = "";
const pad = n => String(n).padStart(2,"0");
function logo(cls){ return `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="splsGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <path class="k" fill="currentColor" fill-rule="evenodd" d="${KEY}"/><path class="w" fill="currentColor" fill-rule="evenodd" d="${WORD}"/></svg>`; }
function render(v){
  const hint = `<div class="hint">КОСНИТЕСЬ ЭКРАНА И ВВЕДИТЕ PIN</div>`;
  if (v === "a") return `<div class="beam"></div>${logo()}<div class="tag">ПЕРВЫЙ МУЗЫКАЛЬНЫЙ МУЛЬТИКОМПЛЕКС</div><div class="sub tm" data-f="a"></div>${hint}`;
  if (v === "b") return `<div class="blk">${logo()}<div class="tag">ПЕРВЫЙ МУЗЫКАЛЬНЫЙ МУЛЬТИКОМПЛЕКС</div><div class="clock tm" data-f="b"></div><div class="date" data-f="d"></div></div>${hint}`;
  return `${logo()}<div class="sub">ПЕРВЫЙ МУЗЫКАЛЬНЫЙ МУЛЬТИКОМПЛЕКС</div><div class="tm" data-f="b"></div>${hint}`;
}
function upd(){ if (!el) return; const d = new Date(), h = pad(d.getHours()), m = pad(d.getMinutes());
  el.querySelectorAll("[data-f=a]").forEach(x => x.innerHTML = `${h}<i>:</i>${m} · ${WD[d.getDay()].toUpperCase()}`);
  el.querySelectorAll("[data-f=b]").forEach(x => x.innerHTML = `${h}<i>:</i>${m}`);
  el.querySelectorAll("[data-f=d]").forEach(x => x.textContent = `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`); }
function pick(){ const all = ["a","b","c"].filter(v => v !== last); return all[Math.floor(Math.random()*all.length)]; }
window.SplSaver = {
  show(opt){ opt = opt || {}; if (el) return;
    if (!document.getElementById("splsCss")){ const s = document.createElement("style"); s.id = "splsCss"; s.textContent = css; document.head.appendChild(s); }
    const v = opt.variant || pick(); last = v;
    el = document.createElement("div"); el.className = "spls " + v; el.innerHTML = render(v); document.body.appendChild(el); upd(); tick = setInterval(upd, 5000);
    const wake = e => { e.preventDefault(); if (opt.onWake) opt.onWake(); else SplSaver.hide(); };
    el.addEventListener("pointerdown", wake); el._k = e => wake(e); document.addEventListener("keydown", el._k, true); },
  hide(){ if (!el) return; clearInterval(tick); document.removeEventListener("keydown", el._k, true); el.remove(); el = null; },
  get on(){ return !!el; },
  logo
};
})();
