/*
 * Luna-служба uz.efir.tv.service:
 *   fetch  {url}               - скачать плейлист, ответ кусками base64 (id, chunks, first)
 *   chunk  {id, index}         - следующий кусок
 *   server {subscribe: true}   - веб-сервер для телефона; события ready / url / file
 *   epgInit  {names}           - подготовить телепрограмму под каналы плейлиста
 *   epgNow   {names, at}       - текущая и следующая передачи: {items: {имя: {c, n}}}
 *   epgRange {name, from, to}  - передачи канала за промежуток: {items: [[start, stop, title, desc]...]}
 */
'use strict';

var fs = require('fs');
var path = require('path');
var Service = require('webos-service');
var core = require('./core.js');
var epg = require('./epg.js');

var service = new Service('uz.efir.tv.service');

var keepAlive = null;
function hold() {
  if (keepAlive) return;
  try {
    service.activityManager.create('efirKeepAlive', function (activity) { keepAlive = activity; });
  } catch (e) { /* без удержания служба всё равно отвечает */ }
}
function release() {
  if (!keepAlive) return;
  try { service.activityManager.complete(keepAlive, function () {}); } catch (e) { /* уже завершено */ }
  keepAlive = null;
}

service.register('fetch', function (message) {
  var payload = message.payload || {};
  if (!payload.url) {
    message.respond({ returnValue: false, errorText: 'url required' });
    return;
  }
  core.fetchUrl(payload.url, payload.headers || {}, function (err, buf) {
    if (err) {
      message.respond({ returnValue: false, errorText: String(err.message || err) });
      return;
    }
    var stored = core.store(buf);
    message.respond({ returnValue: true, id: stored.id, chunks: stored.chunks, first: stored.first, size: buf.length });
  });
});

service.register('chunk', function (message) {
  var payload = message.payload || {};
  var data = core.chunk(String(payload.id), Number(payload.index));
  if (data === null) {
    message.respond({ returnValue: false, errorText: 'no data' });
    return;
  }
  message.respond({ returnValue: true, data: data });
});

// ---------- Веб-сервер для телефона ----------

var subscribers = {};
var server = null;
var starting = false;
var waiting = [];

function subscriberCount() {
  var n = 0;
  for (var k in subscribers) {
    if (subscribers.hasOwnProperty(k)) n++;
  }
  return n;
}

function broadcast(payload) {
  payload.returnValue = true;
  payload.subscribed = true;
  for (var k in subscribers) {
    if (subscribers.hasOwnProperty(k)) {
      try { subscribers[k].respond(payload); } catch (e) { delete subscribers[k]; }
    }
  }
}

function readyPayload() {
  return { returnValue: true, subscribed: true, event: 'ready', port: server.port, ips: core.localIps() };
}

function ensureServer(cb) {
  if (server) {
    cb(null);
    return;
  }
  waiting.push(cb);
  if (starting) return;
  starting = true;
  var page = '';
  try {
    page = fs.readFileSync(path.join(__dirname, 'phone.html'), 'utf8');
  } catch (e) {
    page = '<!doctype html><meta charset="utf-8"><p>EFIR</p>';
  }
  core.startServer(page, {
    onUrl: function (url) { broadcast({ event: 'url', url: url }); },
    onFile: function (buf) {
      var stored = core.store(buf);
      broadcast({ event: 'file', id: stored.id, chunks: stored.chunks, first: stored.first });
    }
  }, function (err, info) {
    starting = false;
    if (!err) server = info;
    var list = waiting;
    waiting = [];
    for (var i = 0; i < list.length; i++) list[i](err);
  });
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

service.register('server', function (message) {
  if (!message.isSubscription) {
    message.respond({ returnValue: false, errorText: 'subscribe required' });
    return;
  }
  hold();
  var token = message.uniqueToken;
  subscribers[token] = message;
  ensureServer(function (err) {
    if (err) {
      delete subscribers[token];
      message.respond({ returnValue: false, errorText: String(err.message || err) });
      if (!subscriberCount()) release();
      return;
    }
    message.respond(readyPayload());
  });
}, function (message) {
  delete subscribers[message.uniqueToken];
  if (!subscriberCount()) {
    stopServer();
    release();
  }
});

// ---------- Телепрограмма ----------

var CACHE_FILES = ['/tmp/efir-epg.json', path.join(__dirname, 'efir-epg.json')];
var epgState = { index: null, names: [], sig: null, loading: false, lastTry: 0, error: null };
var RETRY_MS = 10 * 60 * 1000;

function readCache(sig) {
  for (var i = 0; i < CACHE_FILES.length; i++) {
    try {
      var data = JSON.parse(fs.readFileSync(CACHE_FILES[i], 'utf8'));
      if (data && data.sig === sig && data.index && data.index.chan) return data.index;
    } catch (e) { /* нет файла */ }
  }
  return null;
}

function writeCache(sig, index) {
  var text = JSON.stringify({ sig: sig, index: index });
  for (var i = 0; i < CACHE_FILES.length; i++) {
    try {
      fs.writeFileSync(CACHE_FILES[i], text);
      return;
    } catch (e) { /* пробуем следующее место */ }
  }
}

function epgFresh() {
  return !!epgState.index && Date.now() - epgState.index.updated < epg.MAX_AGE;
}

function epgLoad() {
  if (epgState.loading || !epgState.names.length) return;
  if (Date.now() - epgState.lastTry < RETRY_MS && epgState.error) return;
  epgState.loading = true;
  epgState.lastTry = Date.now();
  hold();
  var sig = epgState.sig;
  epg.loadAny(epg.SOURCES, epgState.names, function (err, index) {
    epgState.loading = false;
    if (!subscriberCount()) release();
    if (sig !== epgState.sig) {
      epgLoad(); // пока качали, сменился плейлист
      return;
    }
    if (err) {
      epgState.error = String(err.message || err);
      return;
    }
    epgState.error = null;
    epgState.index = index;
    writeCache(sig, index);
  });
}

function epgEnsure() {
  if (!epgState.index && epgState.sig) epgState.index = readCache(epgState.sig);
  if (!epgFresh()) epgLoad();
}

function epgStatus() {
  return {
    returnValue: true,
    ready: !!epgState.index,
    loading: epgState.loading,
    updated: epgState.index ? epgState.index.updated : 0,
    error: epgState.error
  };
}

service.register('epgInit', function (message) {
  var names = (message.payload || {}).names;
  if (!names || !names.length) {
    message.respond({ returnValue: false, errorText: 'names required' });
    return;
  }
  var sig = epg.signature(names);
  if (sig !== epgState.sig) {
    epgState.sig = sig;
    epgState.names = names.slice();
    epgState.index = null;
    epgState.error = null;
    epgState.lastTry = 0;
  }
  epgEnsure();
  message.respond(epgStatus());
});

service.register('epgNow', function (message) {
  var payload = message.payload || {};
  if (!epgState.sig) {
    message.respond({ returnValue: true, needInit: true, items: {} });
    return;
  }
  epgEnsure();
  var at = Number(payload.at) || Date.now();
  var names = payload.names || [];
  var items = {};
  for (var i = 0; i < names.length; i++) {
    var r = epg.nowNext(epgState.index, names[i], at);
    items[names[i]] = r || 0;
  }
  var st = epgStatus();
  st.items = items;
  message.respond(st);
});

service.register('epgRange', function (message) {
  var payload = message.payload || {};
  if (!epgState.sig) {
    message.respond({ returnValue: true, needInit: true, items: null });
    return;
  }
  epgEnsure();
  var st = epgStatus();
  st.items = epg.range(epgState.index, String(payload.name || ''), Number(payload.from) || 0, Number(payload.to) || 0);
  message.respond(st);
});
