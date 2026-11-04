/*
 * Проверка открытых источников программы: сколько каналов из списка находится.
 * Запуск: node webos/test/epg-probe.js .github/e2e/channel-names.txt URL...
 */
'use strict';
var fs = require('fs');
var path = require('path');
var epg = require(path.join(__dirname, '..', 'service', 'epg.js'));
var names = fs.readFileSync(process.argv[2], 'utf8').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
var urls = process.argv.slice(3);
var now = Date.now();
(function next(i) {
  if (i >= urls.length) return;
  var url = urls[i];
  var t0 = Date.now();
  var mem0 = process.memoryUsage().rss;
  epg.load(url, names, function (err, index) {
    var secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (err) { console.log('## ' + url + '\nERROR ' + err.message + ' (' + secs + ' s)\n'); next(i + 1); return; }
    var hit = [], miss = [], nowHit = 0, progs = 0;
    for (var k in index.chan) progs += index.chan[k].length;
    names.forEach(function (n) {
      var r = epg.nowNext(index, n, now);
      if (r) { hit.push(n); if (r.c) nowHit++; } else miss.push(n);
    });
    console.log('## ' + url);
    console.log('time ' + secs + ' s, rss +' + ((process.memoryUsage().rss - mem0) / 1048576).toFixed(0) + ' MB, json ' + (JSON.stringify(index).length / 1048576).toFixed(1) + ' MB, programmes ' + progs);
    console.log('matched ' + hit.length + '/' + names.length + ', with current show ' + nowHit);
    var sample = index.chan[epg.normName('Первый канал').key];
    if (sample) console.log('Первый канал sample: ' + sample.slice(0, 3).map(function (p) { return new Date(p[0]).toISOString() + ' ' + p[2]; }).join(' | '));
    console.log('MISSING: ' + miss.join(' | ') + '\n');
    next(i + 1);
  }, now);
})(0);
