/*
 * Телепрограмма (XMLTV) для службы ЭФИРа.
 * Скачивает XMLTV (обычный или .gz), разбирает его потоком и оставляет
 * только каналы из плейлиста и передачи вокруг текущего момента.
 * ES5 и старые API Node - на старых webOS стоит Node 0.12.
 */
'use strict';

var http = require('http');
var https = require('https');
var zlib = require('zlib');
var urlLib = require('url');

// Открытые источники программы для русскоязычных каналов, по порядку
var SOURCES = [
  'http://epg.it999.ru/edem.xml.gz',
  'https://iptvx.one/EPG',
  'http://epg.one/epg2.xml.gz'
];

var KEEP_BEFORE = 8 * 3600 * 1000;    // уже прошедшее сегодня
var KEEP_AFTER = 2 * 24 * 3600 * 1000; // сегодня и завтра
var DESC_MAX = 300;
var MAX_AGE = 12 * 3600 * 1000;       // раз в 12 часов скачиваем заново
var USER_AGENT = 'Mozilla/5.0 (Web0S; Linux/SmartTV) EFIR/1.1';

// ---------- Имена каналов ----------

var TAIL_WORDS = /\s+(hd|fhd|uhd|sd|hdr|4k|8k|orig|original|50|50fps|hevc|h265|\+0)$/;

/**
 * Имя канала из плейлиста или программы -> ключ для сравнения и сдвиг по времени.
 * «Матч! Премьер FHD» -> «матч премьер», «ТНТ +4» -> «тнт» со сдвигом +4 ч,
 * «Sky Sports Action HD 50 UK» -> «sky sports action».
 */
function normName(name) {
  var s = String(name || '');
  var shift = 0;
  // страна в конце: «… UK», «… KZ» (только заглавными)
  s = s.replace(/\s+[A-Z]{2}$/, '');
  s = s.toLowerCase().replace(/ё/g, 'е');
  // уточнения в скобках: «(Элиста)», «(Уфа)»
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/[\s\u00a0]+/g, ' ').trim();
  var prev;
  do {
    prev = s;
    var m = /\s*\+\s?(\d{1,2})$/.exec(s);
    if (m) {
      if (!shift) shift = parseInt(m[1], 10);
      s = s.substring(0, m.index).trim();
    }
    s = s.replace(TAIL_WORDS, '').trim();
  } while (s !== prev);
  // знаки препинания, кроме плюса внутри названия (Viju+)
  s = s.replace(/[!?.,:;'"«»„“”`’\-–—_\/\\|*#&]+/g, ' ');
  s = s.replace(/ +/g, ' ').trim();
  s = s.replace(/\s+\+$/, '+').replace(/\s*\+\s*/g, '+');
  return { key: s, shift: shift };
}

function nameKeys(name) {
  var n = normName(name);
  var keys = [];
  if (n.key) keys.push(n.key);
  var compact = n.key.replace(/ /g, '');
  if (compact && compact !== n.key) keys.push(compact);
  return keys;
}

// ---------- Разбор XMLTV ----------

var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, function (all, e) {
    if (e.charAt(0) === '#') {
      var code = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.substring(2), 16) : parseInt(e.substring(1), 10);
      return isNaN(code) ? all : String.fromCharCode(code);
    }
    return ENT.hasOwnProperty(e) ? ENT[e] : all;
  });
}

function attr(tag, name) {
  var re = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')');
  var m = re.exec(tag);
  if (!m) return null;
  return decode(m[2] !== undefined ? m[2] : m[3]);
}

/** «20261104190000 +0300» -> миллисекунды UTC */
function parseTime(s) {
  var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{2}):?(\d{2})?/.exec(String(s || '').trim());
  if (!m) return NaN;
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) {
    var sign = m[7].charAt(0) === '-' ? -1 : 1;
    var off = (Math.abs(parseInt(m[7], 10)) * 60 + parseInt(m[8] || '0', 10)) * 60000;
    t -= sign * off;
  }
  return t;
}

function firstText(block, tag) {
  var re = new RegExp('<' + tag + '(\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>');
  var m = re.exec(block);
  return m ? decode(m[2]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Потоковый разборщик: feed(текст) по кускам, end() в конце.
 * onChannel(id, [имена]), onProgramme(id, start, stop, title, desc).
 */
function XmltvParser(onChannel, onProgramme) {
  this.buf = '';
  this.onChannel = onChannel;
  this.onProgramme = onProgramme;
}
XmltvParser.prototype.feed = function (text) {
  this.buf += text;
  var b = this.buf;
  var pos = 0;
  for (;;) {
    var open = b.indexOf('<', pos);
    if (open < 0) { pos = b.length; break; }
    var isProg = b.substr(open, 10) === '<programme';
    var isChan = !isProg && b.substr(open, 8) === '<channel';
    if (!isProg && !isChan) {
      // не наш тег - пропускаем до следующего «<»
      if (open + 10 > b.length) { pos = open; break; }
      pos = open + 1;
      continue;
    }
    var closeTag = isProg ? '</programme>' : '</channel>';
    var headEnd = b.indexOf('>', open);
    if (headEnd < 0) { pos = open; break; }
    var end;
    if (b.charAt(headEnd - 1) === '/') {
      end = headEnd + 1;
    } else {
      var c = b.indexOf(closeTag, headEnd);
      if (c < 0) { pos = open; break; }
      end = c + closeTag.length;
    }
    var block = b.substring(open, end);
    var head = b.substring(open, headEnd + 1);
    if (isProg) this.programme(head, block);
    else this.channel(head, block);
    pos = end;
  }
  this.buf = b.substring(pos);
  if (this.buf.length > 4 * 1024 * 1024) this.buf = ''; // испорченный файл - не копим бесконечно
};
XmltvParser.prototype.channel = function (head, block) {
  var id = attr(head, 'id');
  if (!id) return;
  var names = [];
  var re = /<display-name(\s[^>]*)?>([\s\S]*?)<\/display-name>/g;
  var m;
  while ((m = re.exec(block)) !== null) {
    var n = decode(m[2]).trim();
    if (n) names.push(n);
  }
  this.onChannel(id, names);
};
XmltvParser.prototype.programme = function (head, block) {
  var id = attr(head, 'channel');
  if (!id) return;
  var start = parseTime(attr(head, 'start'));
  var stop = parseTime(attr(head, 'stop'));
  if (isNaN(start)) return;
  this.onProgramme(id, start, stop, block);
};
XmltvParser.prototype.end = function () { this.buf = ''; };

// ---------- Индекс под плейлист ----------

/**
 * Собирает программу только для нужных имён.
 * Возвращает объект-сборщик: parser для feed, finish() -> {updated, chan: {ключ: [[start, stop, title, desc]...]}}
 */
function Collector(names, now) {
  this.now = now || Date.now();
  this.wanted = {};
  for (var i = 0; i < names.length; i++) {
    var keys = nameKeys(names[i]);
    for (var k = 0; k < keys.length; k++) this.wanted[keys[k]] = true;
  }
  this.idToKey = {};   // id канала в XMLTV -> ключ
  this.taken = {};     // ключ уже занят каналом
  this.chan = {};
  var self = this;
  this.parser = new XmltvParser(function (id, list) { self.addChannel(id, list); },
    function (id, s, e, block) { self.addProgramme(id, s, e, block); });
}
Collector.prototype.addChannel = function (id, list) {
  var cand = list.slice();
  cand.push(id);
  for (var i = 0; i < cand.length; i++) {
    var keys = nameKeys(cand[i]);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (!this.wanted[key] || this.taken[key]) continue;
      // сдвинутые каналы («+2») в XMLTV пропускаем: сдвиг считаем сами от основного
      if (normName(cand[i]).shift) continue;
      this.taken[key] = id;
      if (!this.idToKey[id]) this.idToKey[id] = [];
      this.idToKey[id].push(key);
    }
  }
};
Collector.prototype.addProgramme = function (id, start, stop, block) {
  var keys = this.idToKey[id];
  if (!keys) return;
  if (isNaN(stop)) stop = start + 3600000;
  if (stop < this.now - KEEP_BEFORE || start > this.now + KEEP_AFTER) return;
  var title = firstText(block, 'title').replace(/^[>\s]+/, '');
  if (!title) return;
  var desc = firstText(block, 'desc');
  if (desc.length > DESC_MAX) desc = desc.substring(0, DESC_MAX - 1).replace(/\s+\S*$/, '') + '…';
  var item = [start, stop, title, desc];
  var list = this.chan[keys[0]];
  if (!list) list = this.chan[keys[0]] = [];
  list.push(item);
};
Collector.prototype.finish = function () {
  var out = { updated: Date.now(), chan: {}, alias: {} };
  for (var id in this.idToKey) {
    if (!this.idToKey.hasOwnProperty(id)) continue;
    var keys = this.idToKey[id];
    var list = this.chan[keys[0]];
    if (!list || !list.length) continue;
    list.sort(function (a, b) { return a[0] - b[0]; });
    // убрать повторы и наложения
    var clean = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var last = clean[clean.length - 1];
      if (last && p[0] === last[0]) continue;
      if (last && last[1] > p[0]) last[1] = p[0];
      clean.push(p);
    }
    out.chan[keys[0]] = clean;
    for (var k = 1; k < keys.length; k++) out.alias[keys[k]] = keys[0];
  }
  return out;
};

// ---------- Запросы к готовому индексу ----------

function listFor(index, name) {
  if (!index) return null;
  var n = normName(name);
  var keys = nameKeys(name);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (index.alias && index.alias[key]) key = index.alias[key];
    var list = index.chan[key];
    if (list) return { list: list, shift: n.shift * 3600000 };
  }
  return null;
}

function findAt(list, t) {
  var lo = 0;
  var hi = list.length - 1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (list[mid][1] <= t) lo = mid + 1;
    else if (list[mid][0] > t) hi = mid - 1;
    else return mid;
  }
  return -lo - 1;
}

function shifted(p, shift, withDesc) {
  var r = [p[0] + shift, p[1] + shift, p[2]];
  if (withDesc && p[3]) r.push(p[3]);
  return r;
}

/** Текущая и следующая передачи: {c: [start, stop, title, desc], n: [start, stop, title]} или null */
function nowNext(index, name, t) {
  var f = listFor(index, name);
  if (!f) return null;
  var at = t - f.shift;
  var i = findAt(f.list, at);
  var res = {};
  if (i >= 0) {
    res.c = shifted(f.list[i], f.shift, true);
    if (i + 1 < f.list.length) res.n = shifted(f.list[i + 1], f.shift, false);
  } else {
    var nextIdx = -i - 1;
    if (nextIdx < f.list.length) res.n = shifted(f.list[nextIdx], f.shift, false);
  }
  return res.c || res.n ? res : null;
}

/** Передачи в промежутке [from, to) */
function range(index, name, from, to) {
  var f = listFor(index, name);
  if (!f) return null;
  var out = [];
  for (var i = 0; i < f.list.length; i++) {
    var p = f.list[i];
    var s = p[0] + f.shift;
    var e = p[1] + f.shift;
    if (e > from && s < to) out.push(shifted(p, f.shift, true));
  }
  return out;
}

// ---------- Загрузка ----------

function openStream(target, cb, hops, insecure) {
  hops = hops || 0;
  var parsed = urlLib.parse(String(target));
  var mod = parsed.protocol === 'https:' ? https : (parsed.protocol === 'http:' ? http : null);
  if (!mod) { cb(new Error('Unsupported URL')); return; }
  var opts = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Accept-Encoding': 'gzip' }
  };
  if (insecure) opts.rejectUnauthorized = false;
  var done = false;
  var req = mod.request(opts, function (res) {
    var code = res.statusCode;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      done = true;
      if (hops >= 6) { cb(new Error('Too many redirects')); return; }
      openStream(urlLib.resolve(target, res.headers.location), cb, hops + 1, insecure);
      return;
    }
    if (code < 200 || code >= 300) {
      res.resume();
      done = true;
      cb(new Error('HTTP ' + code));
      return;
    }
    done = true;
    cb(null, res, req);
  });
  req.on('error', function (e) {
    if (done) return;
    done = true;
    var cert = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|certificate/i.test(String(e.code || '') + ' ' + String(e.message || ''));
    if (cert && !insecure && parsed.protocol === 'https:') { openStream(target, cb, hops, true); return; }
    cb(e);
  });
  req.setTimeout(60000, function () { req.abort(); });
  req.end();
}

/**
 * Скачивает и разбирает программу. cb(err, index).
 * Распаковывает gzip и по заголовку, и по первым байтам (файлы .gz часто отдают без заголовка).
 */
function load(url, names, cb, now) {
  var finished = false;
  function finish(err, res) {
    if (finished) return;
    finished = true;
    cb(err, res);
  }
  openStream(url, function (err, res, req) {
    if (err) { finish(err); return; }
    var collector = new Collector(names, now);
    var decoder = null;
    var sniffed = false;
    var gunzip = null;
    var total = 0;
    var StringDecoder = require('string_decoder').StringDecoder;
    decoder = new StringDecoder('utf8');

    function onText(d) {
      total += d.length;
      if (total > 900 * 1024 * 1024) { try { req.abort(); } catch (e) { /* уже */ } finish(new Error('EPG too large')); return; }
      collector.parser.feed(decoder.write(d));
    }
    function onEnd() {
      collector.parser.feed(decoder.end());
      collector.parser.end();
      var index = collector.finish();
      var count = 0;
      for (var k in index.chan) if (index.chan.hasOwnProperty(k)) count++;
      if (!count) { finish(new Error('No matching channels')); return; }
      index.source = url;
      finish(null, index);
    }
    var enc = String(res.headers['content-encoding'] || '').toLowerCase();
    var src = res;
    if (enc === 'gzip') { src = res.pipe(zlib.createGunzip()); sniffed = true; }
    src.on('error', function (e) { finish(e); });
    if (sniffed) {
      src.on('data', onText);
      src.on('end', onEnd);
      return;
    }
    var first = true;
    res.on('data', function (d) {
      if (first) {
        first = false;
        if (d.length >= 2 && d[0] === 0x1f && d[1] === 0x8b) {
          gunzip = zlib.createGunzip();
          gunzip.on('data', onText);
          gunzip.on('end', onEnd);
          gunzip.on('error', function (e) { finish(e); });
        }
      }
      if (gunzip) gunzip.write(d);
      else onText(d);
    });
    res.on('end', function () {
      if (gunzip) gunzip.end();
      else onEnd();
    });
  });
}

/** Перебирает источники по очереди, пока какой-то не даст каналы. cb(err, index) */
function loadAny(urls, names, cb, now) {
  var i = 0;
  var lastErr = null;
  function next() {
    if (i >= urls.length) { cb(lastErr || new Error('No EPG')); return; }
    var url = urls[i++];
    load(url, names, function (err, index) {
      if (err) { lastErr = err; next(); return; }
      cb(null, index);
    }, now);
  }
  next();
}

/** Подпись списка имён: меняется, когда в плейлисте другие каналы. */
function signature(names) {
  var keys = [];
  for (var i = 0; i < names.length; i++) keys.push(normName(names[i]).key);
  keys.sort();
  var h = 0;
  var s = keys.join('|');
  for (var j = 0; j < s.length; j++) h = (h * 31 + s.charCodeAt(j)) | 0;
  return keys.length + ':' + h;
}

module.exports = {
  SOURCES: SOURCES,
  MAX_AGE: MAX_AGE,
  signature: signature,
  normName: normName,
  nameKeys: nameKeys,
  parseTime: parseTime,
  decode: decode,
  XmltvParser: XmltvParser,
  Collector: Collector,
  nowNext: nowNext,
  range: range,
  load: load,
  loadAny: loadAny
};
