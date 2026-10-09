/*
 * Служба ЭФИРа на телевизоре: загрузка плейлиста без ограничений браузера
 * и маленький веб-сервер для отправки ссылки или файла с телефона.
 * ES5 и старые API Node - на старых webOS стоит Node 0.12.
 */
'use strict';

var http = require('http');
var https = require('https');
var zlib = require('zlib');
var os = require('os');
var urlLib = require('url');
var querystring = require('querystring');

var USER_AGENT = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0 Safari/537.36 EFIR/1.0';
var MAX_BYTES = 50 * 1024 * 1024;
var CHUNK = 786432; // 768 КБ, кратно 3 - куски base64 склеиваются без потерь

function once(fn) {
  var called = false;
  return function () {
    if (called) return;
    called = true;
    fn.apply(null, arguments);
  };
}

function isCertError(err) {
  var code = err && (err.code || '');
  return /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/i.test(String(code)) ||
    /certificate/i.test(String(err && err.message));
}

/** GET с переходами по редиректам и распаковкой gzip. cb(err, Buffer) */
function fetchUrl(target, headers, cb, hops, insecure) {
  cb = once(cb);
  hops = hops || 0;
  var parsed = urlLib.parse(String(target || ''));
  var mod = parsed.protocol === 'https:' ? https : (parsed.protocol === 'http:' ? http : null);
  if (!mod || !parsed.hostname) {
    cb(new Error('Unsupported URL'));
    return;
  }
  var opts = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Accept-Encoding': 'gzip, deflate' }
  };
  var k;
  for (k in headers || {}) {
    if (headers.hasOwnProperty(k)) opts.headers[k] = headers[k];
  }
  // На старых ТВ список корневых сертификатов устарел: при ошибке сертификата пробуем без проверки
  if (parsed.protocol === 'https:' && insecure) opts.rejectUnauthorized = false;

  var req = mod.request(opts, function (res) {
    var code = res.statusCode;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      if (hops >= 6) {
        cb(new Error('Too many redirects'));
        return;
      }
      fetchUrl(urlLib.resolve(target, res.headers.location), headers, cb, hops + 1, insecure);
      return;
    }
    if (code < 200 || code >= 300) {
      res.resume();
      cb(new Error('HTTP ' + code));
      return;
    }
    var stream = res;
    var enc = String(res.headers['content-encoding'] || '').toLowerCase();
    if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
    else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
    var parts = [];
    var size = 0;
    stream.on('data', function (d) {
      size += d.length;
      if (size > MAX_BYTES) {
        req.abort();
        cb(new Error('File too large'));
        return;
      }
      parts.push(d);
    });
    stream.on('end', function () { cb(null, Buffer.concat(parts)); });
    stream.on('error', function (e) { cb(e); });
  });
  req.on('error', function (e) {
    if (!insecure && parsed.protocol === 'https:' && isCertError(e)) {
      fetchUrl(target, headers, cb, hops, true);
      return;
    }
    cb(e);
  });
  req.setTimeout(25000, function () {
    req.abort();
    cb(new Error('Timeout'));
  });
  req.end();
}

// ---------- Передача больших ответов кусками ----------

var blobs = {};
var nextId = 1;

function cleanup() {
  var now = Date.now();
  for (var id in blobs) {
    if (blobs.hasOwnProperty(id) && now - blobs[id].time > 5 * 60 * 1000) delete blobs[id];
  }
}

function sliceBase64(buf, index) {
  return buf.slice(index * CHUNK, (index + 1) * CHUNK).toString('base64');
}

/** Кладёт данные и отдаёт первый кусок; остальные - через chunk(id, index). */
function store(buf) {
  cleanup();
  var id = String(nextId++);
  var chunks = Math.max(1, Math.ceil(buf.length / CHUNK));
  if (chunks > 1) blobs[id] = { buf: buf, chunks: chunks, time: Date.now() };
  return { id: id, chunks: chunks, first: sliceBase64(buf, 0) };
}

function chunk(id, index) {
  var b = blobs[id];
  if (!b || index < 1 || index >= b.chunks) return null;
  var data = sliceBase64(b.buf, index);
  if (index === b.chunks - 1) delete blobs[id];
  return data;
}

// ---------- Адрес телевизора в сети ----------

function localIps() {
  var result = [];
  var preferred = [];
  var ifaces = {};
  try { ifaces = os.networkInterfaces(); } catch (e) { return result; }
  for (var name in ifaces) {
    if (!ifaces.hasOwnProperty(name)) continue;
    var list = ifaces[name] || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal) continue;
      if (/^(wlan|eth|en|wl)/.test(name)) preferred.push(a.address);
      else result.push(a.address);
    }
  }
  return preferred.concat(result);
}

// ---------- Веб-сервер для телефона ----------

function looksLikePlaylist(buf) {
  var head = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString('binary');
  return head.indexOf('#EXTINF') >= 0 || head.indexOf('#EXTM3U') >= 0;
}

function readBody(req, limit, cb) {
  cb = once(cb);
  var parts = [];
  var size = 0;
  req.on('data', function (d) {
    size += d.length;
    if (size > limit) {
      cb(new Error('Too large'));
      req.destroy();
      return;
    }
    parts.push(d);
  });
  req.on('end', function () { cb(null, Buffer.concat(parts)); });
  req.on('error', function (e) { cb(e); });
}

function textBuffer(text) {
  var modern = typeof Buffer.from === 'function' && Buffer.from !== Uint8Array.from;
  return modern ? Buffer.from(text, 'utf8') : new Buffer(text, 'utf8');
}

function send(res, code, body, type) {
  var buf = typeof body === 'string' ? textBuffer(body) : body;
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Connection': 'close'
  });
  res.end(buf);
}

/**
 * Запускает сервер на первом свободном порту 8080-8090.
 * handlers.onUrl(url), handlers.onFile(buffer). cb(err, {port, close})
 */
function startServer(page, handlers, cb) {
  cb = once(cb);
  var server = http.createServer(function (req, res) {
    var path = String(req.url || '/');
    var method = String(req.method || 'GET').toUpperCase();
    if (method === 'POST' && path.indexOf('/url') === 0) {
      readBody(req, 64 * 1024, function (err, body) {
        if (err) {
          send(res, 400, 'ERROR');
          return;
        }
        var form = querystring.parse(body.toString('utf8'));
        var url = String(form.url || '').trim();
        if (!url) {
          send(res, 400, 'EMPTY');
          return;
        }
        send(res, 200, 'OK');
        handlers.onUrl(url);
      });
      return;
    }
    if (method === 'POST' && path.indexOf('/file') === 0) {
      readBody(req, 30 * 1024 * 1024, function (err, body) {
        if (err || !looksLikePlaylist(body)) {
          send(res, 400, 'NO_CHANNELS');
          return;
        }
        send(res, 200, 'OK');
        handlers.onFile(body);
      });
      return;
    }
    if (path.indexOf('/favicon') === 0) {
      send(res, 404, '');
      return;
    }
    send(res, 200, page, 'text/html; charset=utf-8');
  });

  var port = 8080;
  function tryListen() {
    server.once('error', function (e) {
      if (e && e.code === 'EADDRINUSE' && port < 8090) {
        port++;
        tryListen();
      } else {
        cb(e);
      }
    });
    server.listen(port, function () {
      cb(null, {
        port: port,
        close: function () {
          try { server.close(); } catch (e) { /* уже закрыт */ }
        }
      });
    });
  }
  tryListen();
}

module.exports = {
  fetchUrl: fetchUrl,
  store: store,
  chunk: chunk,
  localIps: localIps,
  startServer: startServer,
  looksLikePlaylist: looksLikePlaylist,
  CHUNK: CHUNK
};
