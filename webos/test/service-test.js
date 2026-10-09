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
  res.writeHead(404); res.end('nope');
});

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
