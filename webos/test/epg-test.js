/*
 * Проверка разбора телепрограммы на маленьком XMLTV.
 * Запуск: node webos/test/epg-test.js
 */
'use strict';

var assert = require('assert');
var http = require('http');
var zlib = require('zlib');
var path = require('path');
var epg = require(path.join(__dirname, '..', 'service', 'epg.js'));

// ---------- имена ----------
function key(n) { return epg.normName(n).key; }
assert.strictEqual(key('Первый канал HD'), 'первый канал');
assert.strictEqual(key('Матч! Премьер FHD'), 'матч премьер');
assert.strictEqual(key('Матч! Футбол 1 HD 50 orig'), 'матч футбол 1');
assert.strictEqual(key('Viju+ Sport HD orig'), 'viju+sport');
assert.strictEqual(key('Sky Sports Action HD 50 UK'), 'sky sports action');
assert.strictEqual(key('МУЗ-ТВ +0 (Элиста)'), 'муз тв');
assert.strictEqual(key('Бобёр'), 'бобер');
assert.strictEqual(key('Иллюзион+'), 'иллюзион+');
assert.strictEqual(key('.sci-fi'), 'sci fi');
assert.strictEqual(epg.normName('ТНТ +4').key, 'тнт');
assert.strictEqual(epg.normName('ТНТ +4').shift, 4);
assert.strictEqual(epg.normName('РЕН ТВ HD').shift, 0);
assert.strictEqual(key('ТВ-3 HD'), 'тв 3');
assert.strictEqual(key('360 HD'), '360');
assert.strictEqual(key('ТНТ4'), 'тнт4');

// ---------- время ----------
assert.strictEqual(epg.parseTime('20261104190000 +0300'), Date.UTC(2026, 10, 4, 16, 0, 0));
assert.strictEqual(epg.parseTime('20261104190000 +0000'), Date.UTC(2026, 10, 4, 19, 0, 0));
assert.strictEqual(epg.parseTime('20261104190000 -0130'), Date.UTC(2026, 10, 4, 20, 30, 0));
assert.strictEqual(epg.decode('Tom &amp; Jerry &#171;x&#187; &quot;y&quot;'), 'Tom & Jerry «x» "y"');

// ---------- разбор кусками ----------
var now = Date.UTC(2026, 10, 4, 15, 30, 0); // 18:30 МСК
function t(h, m) { // время МСК -> строка XMLTV
  var d = new Date(Date.UTC(2026, 10, 4, h - 3, m || 0, 0));
  function p(x) { return x < 10 ? '0' + x : String(x); }
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + '00 +0000';
}
var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv generator-info-name="test">\n' +
  '<channel id="1"><display-name lang="ru">Первый канал</display-name><display-name>Первый</display-name><icon src="x"/></channel>\n' +
  '<channel id="ntv"><display-name>НТВ</display-name></channel>\n' +
  '<channel id="tnt"><display-name>ТНТ</display-name></channel>\n' +
  '<channel id="tnt4"><display-name>ТНТ +4</display-name></channel>\n' +
  '<channel id="match"><display-name>Матч Премьер</display-name></channel>\n' +
  '<channel id="other"><display-name>Неизвестный</display-name></channel>\n' +
  '<programme start="' + t(17, 0) + '" stop="' + t(18, 0) + '" channel="1"><title lang="ru">Новости</title></programme>\n' +
  '<programme start="' + t(18, 0) + '" stop="' + t(19, 45) + '" channel="1"><title lang="ru">Время покажет</title><desc lang="ru">Ток-шоу &amp; споры</desc></programme>\n' +
  '<programme start="' + t(19, 45) + '" stop="' + t(20, 50) + '" channel="1"><title>Поле чудес</title></programme>\n' +
  '<programme start="' + t(18, 0) + '" stop="' + t(19, 0) + '" channel="tnt"><title>Универ</title></programme>\n' +
  '<programme start="' + t(14, 0) + '" stop="' + t(15, 0) + '" channel="tnt"><title>Дневное</title></programme>\n' +
  '<programme start="' + t(14, 0) + '" stop="' + t(15, 0) + '" channel="tnt4"><title>Сдвинутое ТНТ</title></programme>\n' +
  '<programme start="' + t(18, 15) + '" stop="' + t(20, 0) + '" channel="match"><title><![CDATA[Футбол. РПЛ]]></title></programme>\n' +
  '<programme start="' + t(18, 0) + '" stop="' + t(19, 0) + '" channel="other"><title>Чужое</title></programme>\n' +
  '</tv>\n';

var names = ['Первый канал HD', 'НТВ HD', 'ТНТ FHD', 'ТНТ +4', 'Матч! Премьер FHD', 'СТС'];

function collect(text, step) {
  var c = new epg.Collector(names, now);
  for (var i = 0; i < text.length; i += step) c.parser.feed(text.substring(i, i + step));
  c.parser.end();
  return c.finish();
}

[1, 7, 64, 100000].forEach(function (step) {
  var idx = collect(xml, step);
  var a = epg.nowNext(idx, 'Первый канал HD', now);
  assert.ok(a && a.c, 'текущая передача при шаге ' + step);
  assert.strictEqual(a.c[2], 'Время покажет');
  assert.strictEqual(a.c[3], 'Ток-шоу & споры');
  assert.strictEqual(a.n[2], 'Поле чудес');
  assert.strictEqual(epg.nowNext(idx, 'Матч! Премьер FHD', now).c[2], 'Футбол. РПЛ');
  assert.strictEqual(epg.nowNext(idx, 'НТВ HD', now), null, 'у НТВ передач нет');
  assert.strictEqual(epg.nowNext(idx, 'СТС', now), null);
  // ТНТ +4: берётся программа основного ТНТ со сдвигом на 4 часа
  var shifted = epg.nowNext(idx, 'ТНТ +4', now);
  assert.ok(shifted && shifted.c, 'сдвиг +4');
  assert.strictEqual(shifted.c[2], 'Дневное');
  assert.strictEqual(shifted.c[0], Date.UTC(2026, 10, 4, 11 + 4, 0, 0));
  assert.ok(!idx.chan['неизвестный'], 'лишние каналы не сохраняются');
});

var idx = collect(xml, 100000);
var day = epg.range(idx, 'Первый канал', Date.UTC(2026, 10, 3, 21), Date.UTC(2026, 10, 4, 21));
assert.deepStrictEqual(day.map(function (p) { return p[2]; }), ['Новости', 'Время покажет', 'Поле чудес']);

// ---------- загрузка: обычный и .gz без заголовка ----------
var gz = zlib.gzipSync(Buffer.from(xml, 'utf8'));
var server = http.createServer(function (req, res) {
  if (req.url === '/epg.xml') { res.end(xml); return; }
  if (req.url === '/epg.xml.gz') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(gz); return; }
  if (req.url === '/redir') { res.writeHead(302, { Location: '/epg.xml.gz' }); res.end(); return; }
  res.writeHead(404); res.end();
});

server.listen(0, function () {
  var base = 'http://127.0.0.1:' + server.address().port;
  var pending = 0;
  function check(url, expectOk) {
    pending++;
    return new Promise(function (resolve) {
      epg.load(url, names, function (err, index) {
        if (expectOk) {
          assert.ifError(err);
          assert.strictEqual(epg.nowNext(index, 'Первый канал HD', now).c[2], 'Время покажет');
        } else {
          assert.ok(err, 'ожидалась ошибка для ' + url);
        }
        resolve();
      }, now);
    });
  }
  Promise.all([
    check(base + '/epg.xml', true),
    check(base + '/epg.xml.gz', true),
    check(base + '/redir', true),
    check(base + '/missing', false)
  ]).then(function () {
    return new Promise(function (resolve) {
      epg.loadAny([base + '/missing', base + '/epg.xml.gz'], names, function (err, index) {
        assert.ifError(err);
        assert.ok(index.source.indexOf('.gz') > 0);
        resolve();
      }, now);
    });
  }).then(function () {
    server.close();
    console.log('epg-test: OK');
  }).catch(function (e) {
    console.error(e);
    process.exit(1);
  });
});
