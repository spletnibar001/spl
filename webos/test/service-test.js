/*
 * Проверка службы на обычном Node: подменяем модуль webos-service,
 * поднимаем тестовый сервер с плейлистами и гоняем методы fetch/chunk/server.
 * Запуск: node webos/test/service-test.js
 */
'use strict';

var Module = require('module');
var http = require('http');
var zlib = require('zlib');
var assert = require('assert');
var path = require('path');

// ---------- подмена webos-service ----------
var registry = {};
function FakeService(id) { this.id = id; }
FakeService.prototype.register = function (name, cb, cancel) { registry[name] = { cb: cb, cancel: cancel }; };
FakeService.prototype.activityManager = {
  create: function (name, cb) { cb({ name: name }); },
  complete: function (a, cb) { if (cb) cb(); }
};
var origLoad = Module._load;
Module._load = function (request) {
  if (request === 'webos-service') return FakeService;
  return origLoad.apply(this, arguments);
};

var token = 0;
function call(name, payload, subscribe, onRespond) {
  var msg = {
    payload: payload,
    isSubscription: !!subscribe,
    uniqueToken: 't' + (++token),
    respond: function (r) { onRespond(r); }
  };
  registry[name].cb(msg);
  return msg;
}
function callOnce(name, payload) {
  return new Promise(function (resolve) { call(name, payload, false, resolve); });
}

// ---------- тестовый сервер ----------
var playlist = '#EXTM3U\n#EXTINF:-1 group-title="Новости",Первый канал\nhttp://a/1.m3u8\n';
var big = '#EXTM3U\n';
for (var i = 0; i < 30000; i++) big += '#EXTINF:-1 group-title="G' + (i % 10) + '",Channel ' + i + '\nhttp://example.com/stream/' + i + '.m3u8\n';

var upstream = http.createServer(function (req, res) {
  if (req.url === '/list.m3u') { res.end(playlist); return; }
  if (req.url === '/gz.m3u') {
    res.writeHead(200, { 'Content-Encoding': 'gzip' });
    res.end(zlib.gzipSync(Buffer.from(playlist)));
    return;
  }
  if (req.url === '/redir') { res.writeHead(302, { Location: '/list.m3u' }); res.end(); return; }
  if (req.url === '/big.m3u') { res.end(big); return; }
  if (req.url === '/epg.xml.gz') { res.end(zlib.gzipSync(Buffer.from(epgXml(), 'utf8'))); return; }
  res.writeHead(404); res.end('nope');
});

// Маленькая телепрограмма: передачи по часу вокруг текущего момента
function epgXml() {
  function ts(ms) { return new Date(ms).toISOString().replace(/[-:T]/g, '').substring(0, 14) + ' +0000'; }
  var h = 3600000;
  var base = Math.floor(Date.now() / h) * h;
  var x = '<?xml version="1.0"?><tv><channel id="p1"><display-name>Первый канал</display-name></channel>';
  for (var k = -2; k < 5; k++) x += '<programme start="' + ts(base + k * h) + '" stop="' + ts(base + (k + 1) * h) + '" channel="p1"><title>Передача ' + k + '</title><desc>Описание ' + k + '</desc></programme>';
  return x + '</tv>';
}

function waitEpg(names, tries) {
  return callOnce('epgNow', { names: names }).then(function (r) {
    if (r.ready || tries <= 0) return r;
    return new Promise(function (res) { setTimeout(res, 100); }).then(function () { return waitEpg(names, tries - 1); });
  });
}

function collect(r) {
  var parts = [r.first];
  var chain = Promise.resolve();
  for (var i = 1; i < r.chunks; i++) {
    (function (index) {
      chain = chain.then(function () {
        return callOnce('chunk', { id: r.id, index: index }).then(function (c) {
          assert.ok(c.returnValue, 'chunk ' + index);
          parts.push(c.data);
        });
      });
    })(i);
  }
  return chain.then(function () { return Buffer.from(parts.join(''), 'base64'); });
}

function post(port, p, body, type) {
  return new Promise(function (resolve, reject) {
    var req = http.request({ hostname: '127.0.0.1', port: port, path: p, method: 'POST', headers: { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) } }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: d }); });
    });
    req.on('error', reject);
    req.end(body);
  });
}
function get(port, p) {
  return new Promise(function (resolve, reject) {
    http.get({ hostname: '127.0.0.1', port: port, path: p }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: d }); });
    }).on('error', reject);
  });
}

upstream.listen(0, function () {
  var base = 'http://127.0.0.1:' + upstream.address().port;
  require(path.join(__dirname, '..', 'service', 'service.js'));
  var results = [];
  function ok(name) { results.push('ok  ' + name); }

  callOnce('fetch', { url: base + '/list.m3u' })
    .then(function (r) { assert.ok(r.returnValue); return collect(r); })
    .then(function (b) { assert.strictEqual(b.toString('utf8'), playlist); ok('fetch plain'); })
    .then(function () { return callOnce('fetch', { url: base + '/gz.m3u' }); })
    .then(function (r) { return collect(r); })
    .then(function (b) { assert.strictEqual(b.toString('utf8'), playlist); ok('fetch gzip'); })
    .then(function () { return callOnce('fetch', { url: base + '/redir' }); })
    .then(function (r) { return collect(r); })
    .then(function (b) { assert.strictEqual(b.toString('utf8'), playlist); ok('fetch redirect'); })
    .then(function () { return callOnce('fetch', { url: base + '/big.m3u' }); })
    .then(function (r) { assert.ok(r.chunks > 1, 'big in chunks: ' + r.chunks); return collect(r); })
    .then(function (b) { assert.strictEqual(b.toString('utf8'), big); ok('fetch big in chunks (' + (b.length / 1048576).toFixed(1) + ' MB)'); })
    .then(function () { return callOnce('fetch', { url: base + '/missing' }); })
    .then(function (r) { assert.strictEqual(r.returnValue, false); ok('fetch 404 -> error'); })
    .then(function () { return callOnce('fetch', { url: 'ftp://x' }); })
    .then(function (r) { assert.strictEqual(r.returnValue, false); ok('fetch bad url -> error'); })
    .then(function () {
      return new Promise(function (resolve) {
        var events = [];
        var sub = call('server', {}, true, function (r) {
          events.push(r);
          if (r.event === 'ready') {
            assert.ok(r.port >= 8080 && r.port <= 8090, 'port');
            assert.ok(Array.isArray(r.ips), 'ips');
            get(r.port, '/')
              .then(function (page) {
                assert.ok(page.body.indexOf('Плейлист для телевизора') >= 0, 'phone page');
                return post(r.port, '/url', 'url=' + encodeURIComponent('http://iptv.example/list.m3u?token=a&b=1'), 'application/x-www-form-urlencoded');
              })
              .then(function (res) { assert.strictEqual(res.body, 'OK'); })
              .then(function () { return post(r.port, '/file', 'just text', 'application/octet-stream'); })
              .then(function (res) { assert.strictEqual(res.status, 400, 'non-playlist file rejected'); })
              .then(function () {
                var cp1251 = Buffer.from('#EXTM3U\n#EXTINF:-1,\xcf\xe5\xf0\xe2\xfb\xe9\nhttp://a/1\n', 'binary');
                return post(r.port, '/file', cp1251, 'application/octet-stream');
              })
              .then(function (res) { assert.strictEqual(res.body, 'OK'); });
          }
          if (r.event === 'file') {
            collect(r).then(function (b) {
              assert.ok(b.toString('binary').indexOf('#EXTINF') >= 0);
              var url = null;
              for (var i = 0; i < events.length; i++) if (events[i].event === 'url') url = events[i].url;
              assert.strictEqual(url, 'http://iptv.example/list.m3u?token=a&b=1');
              ok('server: page, url from phone, file from phone (cp1251 bytes kept)');
              registry.server.cancel(sub);
              setTimeout(resolve, 100);
            });
          }
        });
      });
    })
    .then(function () {
      var epg = require(path.join(__dirname, '..', 'service', 'epg.js'));
      epg.SOURCES.length = 0;
      epg.SOURCES.push(base + '/missing', base + '/epg.xml.gz');
      return callOnce('epgNow', { names: ['Первый канал HD'] });
    })
    .then(function (r) { assert.ok(r.needInit, 'epgNow без epgInit просит инициализацию'); })
    .then(function () { return callOnce('epgInit', { names: ['Первый канал HD', 'НТВ'] }); })
    .then(function (r) { assert.ok(r.returnValue); return waitEpg(['Первый канал HD', 'НТВ'], 50); })
    .then(function (r) {
      assert.ok(r.ready, 'программа загрузилась');
      assert.strictEqual(r.items['Первый канал HD'].c[2], 'Передача 0');
      assert.strictEqual(r.items['Первый канал HD'].c[3], 'Описание 0');
      assert.strictEqual(r.items['Первый канал HD'].n[2], 'Передача 1');
      assert.strictEqual(r.items['НТВ'], 0, 'нет программы - 0');
      var h = 3600000;
      var base0 = Math.floor(Date.now() / h) * h;
      return callOnce('epgRange', { name: 'Первый канал HD', from: base0 - 2 * h, to: base0 + 2 * h });
    })
    .then(function (r) {
      assert.deepStrictEqual(r.items.map(function (p) { return p[2]; }), ['Передача -2', 'Передача -1', 'Передача 0', 'Передача 1']);
      ok('epg: init, now/next, range, fallback to second source');
    })
    .then(function () {
      console.log(results.join('\n'));
      console.log('ALL SERVICE TESTS PASSED');
      upstream.close();
      process.exit(0);
    })
    .catch(function (e) {
      console.log(results.join('\n'));
      console.error('FAIL', e && e.stack || e);
      process.exit(1);
    });
});
