/*
 * Luna-служба uz.efir.tv.service:
 *   fetch  {url}               - скачать плейлист, ответ кусками base64 (id, chunks, first)
 *   chunk  {id, index}         - следующий кусок
 *   server {subscribe: true}   - веб-сервер для телефона; события ready / url / file
 */
'use strict';

var fs = require('fs');
var path = require('path');
var Service = require('webos-service');
var core = require('./core.js');

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
