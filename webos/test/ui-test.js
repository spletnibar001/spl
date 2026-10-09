/*
 * Прогон интерфейса ЭФИРа для webOS в Chromium 1920x1080 с имитацией пульта.
 * Служба на ТВ подменяется заглушкой PalmServiceBridge.
 * Запуск: node ui-test.js <папка app> <папка с тестовыми видео и test.m3u> <папка для снимков>
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var chromium = require('playwright').chromium;

var APP = path.resolve(process.argv[2]);
var MEDIA = path.resolve(process.argv[3]);
var OUT = path.resolve(process.argv[4]);
fs.mkdirSync(OUT, { recursive: true });

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.webm': 'video/webm', '.m3u': 'audio/x-mpegurl', '.json': 'application/json' };

function serve(root, port) {
  return new Promise(function (resolve) {
    http.createServer(function (req, res) {
      var p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (p.endsWith('/')) p += 'index.html';
      fs.stat(p, function (err, st) {
        if (err || !st.isFile()) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end('no'); return; }
        var type = TYPES[path.extname(p)] || 'application/octet-stream';
        var range = req.headers.range;
        var headers = { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
        if (range) {
          var m = /bytes=(\d*)-(\d*)/.exec(range);
          var start = m[1] ? parseInt(m[1], 10) : 0;
          var end = m[2] ? parseInt(m[2], 10) : st.size - 1;
          headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
          headers['Content-Length'] = end - start + 1;
          res.writeHead(206, headers);
          fs.createReadStream(p, { start: start, end: end }).pipe(res);
        } else {
          headers['Content-Length'] = st.size;
          res.writeHead(200, headers);
          fs.createReadStream(p).pipe(res);
        }
      });
    }).listen(port, '127.0.0.1', resolve);
  });
}

var MOCK = function () {
  window.__efir = { serverCb: null, calls: [] };
  window.PalmServiceBridge = function () {
    var self = this;
    self.cancelled = false;
    self.call = function (uri, json) {
      var params = JSON.parse(json);
      var method = uri.split('/').pop();
      window.__efir.calls.push(method);
      function respond(r) {
        setTimeout(function () {
          if (!self.cancelled && self.onservicecallback) self.onservicecallback(JSON.stringify(r));
        }, 20);
      }
      if (method === 'fetch') {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', params.url);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function () {
          if (xhr.status !== 200) { respond({ returnValue: false, errorText: 'HTTP ' + xhr.status }); return; }
          var b = new Uint8Array(xhr.response);
          var bin = '';
          for (var i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
          respond({ returnValue: true, id: '1', chunks: 1, first: btoa(bin) });
        };
        xhr.onerror = function () { respond({ returnValue: false, errorText: 'net' }); };
        xhr.send();
      } else if (method === 'server') {
        window.__efir.serverCb = respond;
        respond({ returnValue: true, subscribed: true, event: 'ready', port: 8080, ips: ['192.168.1.50'] });
      } else {
        respond({ returnValue: false, errorText: 'unknown' });
      }
    };
    self.cancel = function () { self.cancelled = true; };
  };
  window.__emit = function (payload) {
    payload.returnValue = true;
    payload.subscribed = true;
    if (window.__efir.serverCb) window.__efir.serverCb(payload);
  };
};

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  await serve(APP, 5050);
  await serve(MEDIA, 5051);
  var browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  var context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(MOCK);
  var page = await context.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  var n = 0;
  async function shot(name, wait) {
    if (wait) await sleep(wait);
    n++;
    await page.screenshot({ path: path.join(OUT, (n < 10 ? '0' : '') + n + '-' + name + '.png') });
  }
  async function key(k, times) {
    for (var i = 0; i < (times || 1); i++) {
      await page.keyboard.press(k);
      await sleep(120);
    }
  }
  async function longOk() {
    await page.keyboard.down('Enter');
    await sleep(900);
    await page.keyboard.up('Enter');
    await sleep(200);
  }
  async function code(keyCode) {
    await page.evaluate(function (c) {
      ['keydown', 'keyup'].forEach(function (type) {
        var e = new KeyboardEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(e, 'keyCode', { get: function () { return c; } });
        document.dispatchEvent(e);
      });
    }, keyCode);
    await sleep(150);
  }
  async function check(cond, label) {
    var v = await page.evaluate(cond);
    console.log((v ? 'ok   ' : 'FAIL ') + label);
    if (!v) errors.push('check failed: ' + label);
  }

  await page.goto('http://127.0.0.1:5050/index.html');
  await shot('setup', 1200);
  await check(function () { return !!document.querySelector('#qr svg'); }, 'QR на экране настройки');

  // «Телефон» прислал ссылку
  await page.evaluate(function () { window.__emit({ event: 'url', url: 'http://127.0.0.1:5051/test.m3u' }); });
  await shot('start-osd', 1200);
  await check(function () { return document.getElementById('setup').classList.contains('hidden'); }, 'после ссылки настройка закрылась');
  await shot('playing', 3500);
  await check(function () { var v = document.getElementById('video'); return !v.paused && v.readyState >= 2; }, 'видео играет');

  await key('Enter');
  await shot('list', 600);
  await key('ArrowDown', 2);
  await longOk();
  await shot('menu', 300);
  await check(function () { return !document.getElementById('menu').classList.contains('hidden'); }, 'удержание OK открыло меню');
  await key('Enter');
  await shot('fav-added', 400);
  await key('ArrowRight');
  await shot('tab-group', 400);
  await key('ArrowLeft', 2);
  await shot('tab-fav', 400);
  await key('ArrowLeft');
  await shot('tab-settings', 400);

  await key('Escape');
  await key('ArrowDown');
  await shot('osd-switch', 200);
  await shot('switched', 2000);

  await key('1');
  await key('0');
  await shot('dial', 100);
  await shot('dialed', 2600);
  await check(function () { return document.getElementById('osdName').textContent === 'Muz TV'; }, 'набор 10 включил Muz TV');

  await key('4');
  await shot('broken', 9000);
  await check(function () { return !document.getElementById('status').classList.contains('hidden'); }, 'нерабочий канал - сообщение о повторе');

  await key('Enter');
  await shot('list-on-current', 600);
  await key('ArrowUp', 4);
  await key('Enter');
  await page.keyboard.type('yurt');
  await shot('search', 500);
  await key('Enter');
  await key('Enter');
  await shot('search-picked', 2500);
  await check(function () { return document.getElementById('panel').classList.contains('hidden'); }, 'выбор из поиска закрыл список');

  // Скрыть канал и найти его в Настройках
  await key('Enter');
  await key('ArrowDown');
  await code(403); // красная кнопка - меню
  await key('ArrowDown');
  await key('Enter');
  await shot('hidden', 400);
  await key('ArrowLeft', 2);
  await key('ArrowDown', 2);
  await key('Enter');
  await shot('hidden-list', 400);
  await key('Escape');
  await key('Escape');
  await key('Escape');
  await shot('back-once', 200);

  // Перезапуск: последний канал из сохранённого списка
  await page.reload();
  await shot('relaunch-osd', 1500);
  await check(function () { return document.getElementById('osdName').textContent === 'Mening Yurtim'; }, 'после перезапуска - последний канал');

  // Смена плейлиста файлом в Windows-1251
  await key('Enter');
  await key('ArrowLeft', 2);
  await key('ArrowDown');
  await key('Enter');
  await shot('change-setup', 600);
  await page.evaluate(function () {
    var bin = '#EXTM3U\n#EXTINF:-1 group-title="\xc8\xe7 \xf4\xe0\xe9\xeb\xe0",\xca\xe0\xed\xe0\xeb \xe8\xe7 \xf4\xe0\xe9\xeb\xe0\nhttp://127.0.0.1:5051/ch3.webm\n#EXTINF:-1,\xc2\xf2\xee\xf0\xee\xe9\nhttp://127.0.0.1:5051/ch2.webm\n';
    window.__emit({ event: 'file', id: '9', chunks: 1, first: btoa(bin) });
  });
  await shot('file-playing', 2000);
  await key('Enter');
  await shot('file-list', 600);
  await check(function () { return document.getElementById('list').textContent.indexOf('Канал из файла') >= 0; }, 'файл в cp1251 прочитан по-русски');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(errors.filter(function (e) { return e.indexOf('check failed') === 0 || e.indexOf('pageerror') === 0; }).length ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
