/*
 * ЭФИР для LG webOS.
 * Код намеренно на ES5 (var, function, без стрелок и шаблонных строк),
 * чтобы работать и на старых телевизорах с webOS 3-4.
 */
(function () {
  'use strict';

  // ---------- Константы ----------

  var SERVICE = 'luna://uz.efir.tv.service/';
  var LOCAL = 'local:phone';
  var TAB_FAV = '\u0001fav';
  var TAB_ALL = '\u0001all';
  var TAB_SETTINGS = '\u0001settings';
  var ACTION_REFRESH = 1;
  var ACTION_CHANGE = 2;
  var ACTION_HIDDEN = 3;
  var ACTION_UNHIDE_ALL = 4;

  var OSD_MS = 3500;
  var TOAST_MS = 2500;
  var PANEL_IDLE_MS = 30000;
  var SWITCH_DELAY_MS = 350;
  var DIAL_DELAY_MS = 2000;
  var BACK_EXIT_MS = 3000;
  var OK_LONG_MS = 700;
  var START_TIMEOUT_MS = 25000;
  var PAGE = 8;

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13,
    BACK: 461, ESC: 27, BACKSPACE: 8,
    PAGE_UP: 33, PAGE_DOWN: 34, CH_UP: 427, CH_DOWN: 428,
    INFO: 457, GUIDE: 458, RED: 403,
    PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252
  };

  var T = {
    tabFav: 'Избранное',
    tabAll: 'Все',
    tabSettings: 'Настройки',
    emptySearch: 'Ничего не найдено',
    emptyFav: 'Пока пусто. Удерживайте OK на канале и выберите «В избранное»',
    refresh: 'Обновить плейлист',
    change: 'Сменить плейлист',
    hidden: 'Скрытые: %1',
    unhideAll: 'Вернуть все',
    restoreGroup: 'Группа «%1»',
    favAdded: '«%1» в избранном',
    favRemoved: '«%1» убран из избранного',
    menuFav: 'В избранное',
    menuUnfav: 'Убрать из избранного',
    menuHide: 'Скрыть канал',
    menuHideGroup: 'Скрыть группу «%1»',
    hiddenChannel: '«%1» скрыт - вернуть можно в Настройках',
    hiddenGroup: 'Группа «%1» скрыта - вернуть можно в Настройках',
    restored: '«%1» снова в списке',
    restoredAll: 'Все скрытые каналы возвращены',
    noChannel: 'Канала %1 нет',
    pressBack: 'Нажмите НАЗАД ещё раз, чтобы выйти',
    unavailable: 'Канал не отвечает - пробую снова',
    refreshing: 'Обновляю плейлист…',
    refreshed: 'Плейлист обновлён: %1 каналов',
    refreshFailed: 'Не удалось обновить - работает сохранённый список',
    localPlaylist: 'Плейлист загружен файлом - чтобы обновить, загрузите его заново через «Сменить плейлист»',
    loading: 'Загружаю плейлист…',
    received: 'Ссылка получена, загружаю…',
    fileReceived: 'Файл получен, читаю каналы…',
    errorEmpty: 'Вставьте ссылку на плейлист',
    errorLoad: 'Плейлист не загрузился. Проверьте ссылку и интернет',
    errorParse: 'В плейлисте не нашлось каналов',
    browserAddress: 'или в браузере: %1',
    noNetwork: 'Нет сети - подключите телевизор к Wi-Fi',
    noPhone: 'Приём с телефона недоступен - введите ссылку пультом',
    channel: 'Канал %1'
  };

  // ---------- Мелочи ----------

  function $(id) { return document.getElementById(id); }
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function shown(el) { return !el.classList.contains('hidden'); }
  function later(fn, ms) { return setTimeout(fn, ms); }
  function fmt(s) {
    var args = arguments;
    return s.replace(/%(\d)/g, function (m, i) { return String(args[+i]); });
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function remPx(r) { return r * parseFloat(window.getComputedStyle(document.documentElement).fontSize); }
  function svg(className, viewBox, paths) {
    var ns = 'http://www.w3.org/2000/svg';
    var el = document.createElementNS(ns, 'svg');
    el.setAttribute('class', className);
    el.setAttribute('viewBox', viewBox);
    for (var i = 0; i < paths.length; i++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', paths[i]);
      el.appendChild(p);
    }
    return el;
  }
  var STAR = 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z';
  var BARS = ['M5 18V12', 'M10 18V6', 'M15 18V9', 'M20 18V14'];

  // ---------- Хранилище ----------

  var storage = {
    get: function (key, def) {
      try {
        var v = window.localStorage.getItem('efir.' + key);
        return v === null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem('efir.' + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    getRaw: function (key) {
      try { return window.localStorage.getItem('efir.' + key); } catch (e) { return null; }
    },
    setRaw: function (key, value) {
      try {
        window.localStorage.setItem('efir.' + key, value);
        return true;
      } catch (e) {
        try { window.localStorage.removeItem('efir.' + key); } catch (e2) { /* нет места */ }
        return false;
      }
    }
  };

  function toSet(arr) {
    var s = {};
    if (arr && arr.length) {
      for (var i = 0; i < arr.length; i++) s[arr[i]] = true;
    }
    return s;
  }
  function setKeys(set) {
    var out = [];
    for (var k in set) {
      if (set.hasOwnProperty(k)) out.push(k);
    }
    return out;
  }

  var prefs = {
    url: storage.get('url', null),
    last: storage.get('last', null),
    lastTab: storage.get('tab', null),
    fav: toSet(storage.get('fav', [])),
    hidden: toSet(storage.get('hidden', [])),
    hiddenGroups: toSet(storage.get('hiddenGroups', []))
  };

  function isFav(ch) { return prefs.fav.hasOwnProperty(ch.name); }
  function isHidden(ch) {
    if (prefs.hidden.hasOwnProperty(ch.name)) return true;
    return !!ch.group && prefs.hiddenGroups.hasOwnProperty(ch.group);
  }
  function hiddenCount() { return setKeys(prefs.hidden).length + setKeys(prefs.hiddenGroups).length; }
  function saveHidden() {
    storage.set('hidden', setKeys(prefs.hidden));
    storage.set('hiddenGroups', setKeys(prefs.hiddenGroups));
  }
  function sortedKeys(set) {
    return setKeys(set).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
  }

  // ---------- Плейлист M3U ----------

  function newEntry() {
    return { title: '', tvgName: null, logo: null, group: null, chno: null };
  }

  function titleComma(line) {
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') inQuotes = !inQuotes;
      else if (c === ',' && !inQuotes) return i;
    }
    return -1;
  }

  function parseExtInf(line) {
    var e = newEntry();
    var comma = titleComma(line);
    var attrs = comma >= 0 ? line.substring(0, comma) : line;
    e.title = comma >= 0 ? line.substring(comma + 1).trim() : '';
    var re = /([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"/g;
    var m;
    while ((m = re.exec(attrs)) !== null) {
      var key = m[1].toLowerCase();
      var val = m[2].trim();
      if (!val) continue;
      if (key === 'tvg-name') e.tvgName = val;
      else if (key === 'tvg-logo' || key === 'logo') e.logo = val;
      else if (key === 'group-title') e.group = val;
      else if (key === 'tvg-chno' || key === 'channel-number') {
        var n = parseInt(val, 10);
        e.chno = isNaN(n) ? null : n;
      }
    }
    return e;
  }

  function parseM3u(text) {
    var lines = String(text || '').split(/\r\n|\r|\n/);
    var raws = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^﻿/, '').trim();
      if (!line) continue;
      var head = line.substring(0, 11).toUpperCase();
      if (head.indexOf('#EXTINF') === 0) {
        cur = parseExtInf(line);
      } else if (head.indexOf('#EXTGRP:') === 0) {
        if (!cur) cur = newEntry();
        if (!cur.group) cur.group = line.substring(8).trim() || null;
      } else if (line.charAt(0) === '#') {
        continue;
      } else {
        var e = cur || newEntry();
        var url = line;
        var pipe = line.indexOf('|');
        if (pipe > 0) url = line.substring(0, pipe).trim();
        if (url.indexOf('://') > 0) raws.push({ e: e, url: url });
        cur = null;
      }
    }
    var useChno = raws.length > 0;
    var seen = {};
    for (i = 0; i < raws.length && useChno; i++) {
      var n = raws[i].e.chno;
      if (!(n > 0) || seen[n]) useChno = false;
      seen[n] = true;
    }
    var list = [];
    for (i = 0; i < raws.length; i++) {
      var r = raws[i];
      var number = useChno ? r.e.chno : i + 1;
      list.push({
        number: number,
        name: r.e.title || r.e.tvgName || fmt(T.channel, number),
        url: r.url,
        logo: r.e.logo,
        group: r.e.group
      });
    }
    return list;
  }

  function initials(name) {
    var words = String(name).split(/[\s\-_.|\/()\[\]]+/);
    var clean = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i].replace(/[^0-9A-Za-zÀ-ɏЀ-ӿ]/g, '');
      if (w) clean.push(w);
    }
    if (!clean.length) return 'TV';
    var s = clean.length === 1 ? clean[0].substring(0, 2) : clean[0].charAt(0) + clean[1].charAt(0);
    return s.toUpperCase();
  }

  // ---------- Текст из байтов ----------

  function base64ToBytes(b64) {
    var bin = window.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** UTF-8, а если не читается - Windows-1251 (бывает у старых плейлистов). */
  function decodeBytes(bytes) {
    if (window.TextDecoder) {
      try { return new window.TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* не UTF-8 */ }
      try { return new window.TextDecoder('windows-1251').decode(bytes); } catch (e2) { /* нет кодировки */ }
    }
    var bin = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + 8192)));
    }
    try { return decodeURIComponent(escape(bin)); } catch (e3) { return bin; }
  }

  // ---------- Служба на телевизоре (Luna) ----------

  function hasService() { return typeof window.PalmServiceBridge !== 'undefined'; }
  var liveBridges = [];

  function luna(method, params, onResponse) {
    var bridge = new window.PalmServiceBridge();
    liveBridges.push(bridge);
    bridge.onservicecallback = function (msg) {
      var r;
      try { r = JSON.parse(msg); } catch (e) { r = { returnValue: false, errorText: 'bad response' }; }
      onResponse(r);
    };
    bridge.call(SERVICE + method, JSON.stringify(params || {}));
    return bridge;
  }

  function releaseBridge(bridge) {
    var i = liveBridges.indexOf(bridge);
    if (i >= 0) liveBridges.splice(i, 1);
    try { bridge.cancel(); } catch (e) { /* уже закрыт */ }
  }

  function collectChunks(id, total, first, cb) {
    var parts = [first];
    var index = 1;
    function next() {
      if (index >= total) {
        cb(null, base64ToBytes(parts.join('')));
        return;
      }
      var b = luna('chunk', { id: id, index: index }, function (r) {
        releaseBridge(b);
        if (!r.returnValue) { cb(r.errorText || 'chunk'); return; }
        parts.push(r.data);
        index++;
        next();
      });
    }
    next();
  }

  function fetchViaService(url, cb) {
    var finished = false;
    var timer = later(function () {
      if (finished) return;
      finished = true;
      cb('timeout');
    }, 60000);
    var b = luna('fetch', { url: url }, function (r) {
      releaseBridge(b);
      if (finished) return;
      if (!r.returnValue) {
        finished = true;
        clearTimeout(timer);
        cb(r.errorText || 'error');
        return;
      }
      collectChunks(r.id, r.chunks, r.first, function (err, bytes) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (err) cb(err);
        else cb(null, decodeBytes(bytes));
      });
    });
  }

  function fetchViaXhr(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 30000;
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) cb(null, decodeBytes(new Uint8Array(xhr.response)));
      else cb('HTTP ' + xhr.status);
    };
    xhr.onerror = function () { cb('network'); };
    xhr.ontimeout = function () { cb('timeout'); };
    xhr.send();
  }

  /** Плейлист по ссылке: через службу на ТВ (без ограничений CORS), иначе напрямую. */
  function loadPlaylistText(url, cb) {
    if (hasService()) {
      fetchViaService(url, function (err, text) {
        if (!err) { cb(null, text); return; }
        fetchViaXhr(url, cb);
      });
    } else {
      fetchViaXhr(url, cb);
    }
  }

  function normalizeUrl(input) {
    var url = String(input || '').trim();
    if (!url) return '';
    return url.indexOf('://') > 0 ? url : 'http://' + url;
  }

  // ---------- Состояние ----------

  var video = $('video');
  var el = {
    spinner: $('spinner'), status: $('status'), centerBox: $('centerBox'), dial: $('dial'), toast: $('toast'),
    osd: $('osd'), osdNumber: $('osdNumber'), osdInitials: $('osdInitials'), osdLogo: $('osdLogo'),
    osdName: $('osdName'), osdGroup: $('osdGroup'), osdFav: $('osdFav'), osdClock: $('osdClock'),
    panel: $('panel'), tabs: $('tabs'), searchBox: $('searchBox'), searchInput: $('searchInput'),
    list: $('list'), emptyText: $('emptyText'),
    menu: $('menu'), menuTitle: $('menuTitle'), menuItems: $('menuItems'),
    setup: $('setup'), qr: $('qr'), serverAddress: $('serverAddress'), urlInput: $('urlInput'),
    loadBtn: $('loadBtn'), setupStatus: $('setupStatus')
  };

  var mode = 'watch'; // watch | panel | menu | setup
  var channels = [];
  var current = null;

  var tabs = [];
  var tabIndex = 0;
  var hiddenMode = false;

  var rows = [];
  var focusIndex = 0; // -1 - поле поиска
  var topIndex = 0;
  var visibleRows = 8;
  var renderedTop = -1;
  var rowsVersion = 0;
  var renderedVersion = -1;

  var menuChannel = null;
  var menuItems = [];
  var menuFocus = 0;
  var menuReturn = 0;

  var setupFocus = 0;
  var setupBusy = false;
  var serverBridge = null;

  var pendingScope = [];
  var pendingIndex = -1;
  var dial = '';
  var lastBack = 0;

  var timers = { osd: null, toast: null, panel: null, switching: null, dial: null, retry: null, start: null, ok: null };
  var okDownMode = null;
  var okDownTime = 0;
  var okLong = false;

  var hls = null;
  var retries = 0;

  function visibleChannels() {
    var out = [];
    for (var i = 0; i < channels.length; i++) {
      if (!isHidden(channels[i])) out.push(channels[i]);
    }
    return out;
  }

  function sameChannel(a, b) { return !!a && !!b && a.name === b.name; }

  // ---------- Видео ----------

  var isWebOS = hasService() || /Web0S|webOS/i.test(navigator.userAgent);

  function isHlsUrl(url) {
    var path = url.split('?')[0].split('#')[0].toLowerCase();
    return /\.m3u8?$/.test(path) || url.toLowerCase().indexOf('m3u8') >= 0;
  }

  function nativeHls() {
    if (isWebOS) return true;
    return !!(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'));
  }

  function withHlsJs(cb) {
    if (window.Hls) { cb(window.Hls.isSupported()); return; }
    var s = document.createElement('script');
    s.src = 'lib/hls.min.js';
    s.onload = function () { cb(!!window.Hls && window.Hls.isSupported()); };
    s.onerror = function () { cb(false); };
    document.body.appendChild(s);
  }

  function stopVideo() {
    if (hls) {
      try { hls.destroy(); } catch (e) { /* уже закрыт */ }
      hls = null;
    }
    try { video.pause(); } catch (e2) { /* нет видео */ }
    video.removeAttribute('src');
    try { video.load(); } catch (e3) { /* пустой */ }
  }

  function playVideo() {
    var p = video.play();
    if (p && p.then) p.then(null, function () { /* автозапуск без звука запрещён - не страшно на ТВ */ });
  }

  function startPlayback(ch) {
    clearTimeout(timers.retry);
    clearTimeout(timers.start);
    stopVideo();
    show(el.spinner);
    timers.start = later(function () { if (current === ch) scheduleRetry(); }, START_TIMEOUT_MS);
    if (isHlsUrl(ch.url) && !nativeHls()) {
      withHlsJs(function (ok) {
        if (current !== ch) return;
        if (!ok) {
          video.src = ch.url;
          playVideo();
          return;
        }
        var Hls = window.Hls;
        var h = new Hls({ enableWorker: false });
        hls = h;
        h.on(Hls.Events.MANIFEST_PARSED, function () { playVideo(); });
        h.on(Hls.Events.ERROR, function (event, data) {
          if (data && data.fatal && hls === h) scheduleRetry();
        });
        h.loadSource(ch.url);
        h.attachMedia(video);
      });
      return;
    }
    video.src = ch.url;
    playVideo();
  }

  function scheduleRetry() {
    clearTimeout(timers.retry);
    clearTimeout(timers.start);
    retries++;
    hide(el.spinner);
    if (retries >= 2) showStatus(T.unavailable);
    var delay = retries <= 1 ? 1000 : (retries <= 4 ? 3000 : 8000);
    timers.retry = later(function () { if (current) startPlayback(current); }, delay);
  }

  video.addEventListener('waiting', function () { if (current) show(el.spinner); });
  video.addEventListener('playing', function () {
    clearTimeout(timers.start);
    hide(el.spinner);
    hideStatus();
    retries = 0;
  });
  video.addEventListener('error', function () {
    if (!current || hls) return;
    if (!video.getAttribute('src')) return;
    scheduleRetry();
  });
  video.addEventListener('ended', function () { if (current) scheduleRetry(); });

  function play(ch, showInfo) {
    current = ch;
    prefs.last = ch.name;
    storage.set('last', ch.name);
    retries = 0;
    hideStatus();
    if (showInfo) showOsd(ch);
    if (mode === 'panel') renderList(true);
    startPlayback(ch);
  }

  function onVisibility() {
    var hidden = document.hidden || document.webkitHidden;
    if (hidden) {
      clearTimeout(timers.retry);
      clearTimeout(timers.start);
      stopVideo();
    } else if (current && mode !== 'setup') {
      startPlayback(current);
    }
  }
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('webkitvisibilitychange', onVisibility);

  // ---------- Сообщения на экране ----------

  function showOsd(ch) {
    if (mode === 'panel' || mode === 'menu' || mode === 'setup') return;
    el.osdNumber.textContent = String(ch.number);
    el.osdName.textContent = ch.name;
    el.osdGroup.textContent = ch.group || '';
    if (ch.group) show(el.osdGroup); else hide(el.osdGroup);
    setBadge(el.osdInitials, el.osdLogo, ch);
    if (isFav(ch)) show(el.osdFav); else hide(el.osdFav);
    var now = new Date();
    el.osdClock.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    show(el.osd);
    clearTimeout(timers.osd);
    timers.osd = later(function () { hide(el.osd); }, OSD_MS);
  }

  function hideOsd() {
    clearTimeout(timers.osd);
    hide(el.osd);
  }

  function setBadge(initialsEl, img, ch) {
    initialsEl.textContent = initials(ch.name);
    initialsEl.style.visibility = 'visible';
    img.onload = null;
    img.onerror = null;
    if (ch.logo) {
      img.style.display = '';
      img.onload = function () { initialsEl.style.visibility = 'hidden'; };
      img.onerror = function () { img.style.display = 'none'; initialsEl.style.visibility = 'visible'; };
      img.src = ch.logo;
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
  }

  function showToast(text) {
    el.toast.textContent = text;
    show(el.toast);
    clearTimeout(timers.toast);
    timers.toast = later(function () { hide(el.toast); }, TOAST_MS);
  }

  function showStatus(text) {
    el.status.textContent = text;
    show(el.status);
  }

  function hideStatus() { hide(el.status); }

  function shiftOverlays(open) {
    if (open) {
      el.centerBox.classList.add('shifted');
      el.toast.classList.add('shifted');
    } else {
      el.centerBox.classList.remove('shifted');
      el.toast.classList.remove('shifted');
    }
  }

  // ---------- Плейлист в приложении ----------

  function applyPlaylist(list) {
    if (!list.length) return;
    channels = list;
    buildTabs();
    var previous = current;
    var target = null;
    var i;
    if (previous) {
      for (i = 0; i < list.length && !target; i++) if (list[i].name === previous.name) target = list[i];
    }
    if (!target && prefs.last) {
      for (i = 0; i < list.length && !target; i++) if (list[i].name === prefs.last) target = list[i];
    }
    if (!target) target = list[0];
    if (!previous || previous.url !== target.url || previous.name !== target.name) play(target, !previous);
    else current = target;
    if (mode === 'panel') refreshRows();
  }

  function saveCache(text) {
    storage.setRaw('cache', text);
  }

  function refresh(userInitiated) {
    var url = prefs.url;
    if (!url) return;
    if (url === LOCAL) {
      if (userInitiated) showToast(T.localPlaylist);
      return;
    }
    if (userInitiated) showToast(T.refreshing);
    loadPlaylistText(url, function (err, text) {
      if (err) {
        if (userInitiated) showToast(T.refreshFailed);
        return;
      }
      var list = parseM3u(text);
      if (!list.length) {
        if (userInitiated) showToast(T.refreshFailed);
        return;
      }
      saveCache(text);
      applyPlaylist(list);
      if (userInitiated) showToast(fmt(T.refreshed, list.length));
    });
  }

  // ---------- Переключение каналов ----------

  function channelsOf(tab) {
    var visible = visibleChannels();
    if (!tab || tab === TAB_ALL || tab === TAB_SETTINGS) return visible;
    var out = [];
    for (var i = 0; i < visible.length; i++) {
      var c = visible[i];
      if (tab === TAB_FAV ? isFav(c) : c.group === tab) out.push(c);
    }
    return out;
  }

  function indexIn(list, ch) {
    if (!ch) return -1;
    for (var i = 0; i < list.length; i++) if (list[i].name === ch.name) return i;
    return -1;
  }

  function switchChannel(delta) {
    if (!channels.length) return;
    if (pendingIndex < 0) {
      var scope = channelsOf(prefs.lastTab);
      var index = indexIn(scope, current);
      if (index < 0) {
        scope = visibleChannels();
        index = indexIn(scope, current);
      }
      pendingScope = scope;
      pendingIndex = index < 0 ? 0 : index;
    }
    var size = pendingScope.length;
    if (!size) return;
    pendingIndex = ((pendingIndex + delta) % size + size) % size;
    showOsd(pendingScope[pendingIndex]);
    clearTimeout(timers.switching);
    timers.switching = later(commitSwitch, SWITCH_DELAY_MS);
  }

  function commitSwitch() {
    clearTimeout(timers.switching);
    var target = pendingScope[pendingIndex];
    pendingIndex = -1;
    pendingScope = [];
    if (target && !sameChannel(target, current)) play(target, false);
  }

  function onDigit(d) {
    if (dial.length >= 4) dial = '';
    dial += String(d);
    el.dial.textContent = dial;
    show(el.dial);
    clearTimeout(timers.dial);
    timers.dial = later(commitDial, DIAL_DELAY_MS);
  }

  function commitDial() {
    clearTimeout(timers.dial);
    var number = parseInt(dial, 10);
    dial = '';
    hide(el.dial);
    if (isNaN(number)) return;
    var visible = visibleChannels();
    var target = null;
    for (var i = 0; i < visible.length && !target; i++) if (visible[i].number === number) target = visible[i];
    if (!target) {
      showToast(fmt(T.noChannel, number));
      return;
    }
    if (pendingIndex >= 0) {
      clearTimeout(timers.switching);
      pendingIndex = -1;
      pendingScope = [];
    }
    if (!sameChannel(target, current)) play(target, true);
    else showOsd(target);
  }

  function cancelDial() {
    clearTimeout(timers.dial);
    dial = '';
    hide(el.dial);
  }

  function toggleFavorite(ch) {
    var added;
    if (isFav(ch)) {
      delete prefs.fav[ch.name];
      added = false;
    } else {
      prefs.fav[ch.name] = true;
      added = true;
    }
    storage.set('fav', setKeys(prefs.fav));
    showToast(fmt(added ? T.favAdded : T.favRemoved, ch.name));
    if (shown(el.osd) && sameChannel(current, ch)) {
      if (added) show(el.osdFav); else hide(el.osdFav);
    }
    return added;
  }

  // ---------- Вкладки ----------

  function buildTabs() {
    var previous = tabs[tabIndex] || prefs.lastTab;
    var groups = [];
    var seen = {};
    var visible = visibleChannels();
    for (var i = 0; i < visible.length; i++) {
      var g = visible[i].group;
      if (g && !seen[g]) {
        seen[g] = true;
        groups.push(g);
      }
    }
    tabs = [TAB_FAV, TAB_ALL].concat(groups).concat([TAB_SETTINGS]);
    var index = previous ? tabs.indexOf(previous) : -1;
    tabIndex = index >= 0 ? index : tabs.indexOf(TAB_ALL);
  }

  function tabLabel(tab) {
    if (tab === TAB_FAV) return T.tabFav;
    if (tab === TAB_ALL) return T.tabAll;
    if (tab === TAB_SETTINGS) return T.tabSettings;
    return tab;
  }

  function renderTabs() {
    var box = el.tabs;
    box.innerHTML = '';
    var activeEl = null;
    for (var i = 0; i < tabs.length; i++) {
      var t = document.createElement('div');
      t.className = 'tab' + (i === tabIndex ? ' active' : '');
      t.textContent = tabLabel(tabs[i]);
      t.setAttribute('data-index', String(i));
      t.addEventListener('click', onTabClick);
      box.appendChild(t);
      if (i === tabIndex) activeEl = t;
    }
    var windowWidth = box.parentNode.clientWidth;
    var shift = 0;
    if (activeEl) {
      shift = activeEl.offsetLeft - (windowWidth - activeEl.offsetWidth) / 2;
      shift = clamp(shift, 0, Math.max(0, box.scrollWidth - windowWidth));
    }
    box.style.webkitTransform = 'translateX(' + (-shift) + 'px)';
    box.style.transform = 'translateX(' + (-shift) + 'px)';
  }

  function onTabClick(e) {
    var i = parseInt(e.currentTarget.getAttribute('data-index'), 10);
    if (isNaN(i) || i === tabIndex) return;
    switchTab(i - tabIndex);
  }

  function switchTab(delta) {
    if (!tabs.length) return;
    tabIndex = ((tabIndex + delta) % tabs.length + tabs.length) % tabs.length;
    hiddenMode = false;
    clearSearch();
    refreshRows();
    var idx = indexOfCurrent();
    focusRow(idx >= 0 ? idx : 0);
  }

  // ---------- Строки списка ----------

  function query() { return String(el.searchInput.value || '').trim(); }

  function refreshRows() {
    var q = query();
    var tab = tabs[tabIndex] || TAB_ALL;
    var out = [];
    var i;
    if (q) {
      var digits = /^\d+$/.test(q);
      var lower = q.toLowerCase();
      var visible = visibleChannels();
      for (i = 0; i < visible.length; i++) {
        var c = visible[i];
        if ((digits && String(c.number).indexOf(q) === 0) || c.name.toLowerCase().indexOf(lower) >= 0) {
          out.push({ type: 'ch', ch: c });
        }
      }
    } else if (tab === TAB_SETTINGS && hiddenMode) {
      out.push({ type: 'action', id: ACTION_UNHIDE_ALL, title: T.unhideAll });
      var groups = sortedKeys(prefs.hiddenGroups);
      for (i = 0; i < groups.length; i++) out.push({ type: 'restore', key: groups[i], group: true, title: fmt(T.restoreGroup, groups[i]) });
      var names = sortedKeys(prefs.hidden);
      for (i = 0; i < names.length; i++) out.push({ type: 'restore', key: names[i], group: false, title: names[i] });
    } else if (tab === TAB_SETTINGS) {
      out.push({ type: 'action', id: ACTION_REFRESH, title: T.refresh });
      out.push({ type: 'action', id: ACTION_CHANGE, title: T.change });
      var hidden = hiddenCount();
      if (hidden > 0) out.push({ type: 'action', id: ACTION_HIDDEN, title: fmt(T.hidden, hidden) });
    } else {
      var list = channelsOf(tab);
      for (i = 0; i < list.length; i++) out.push({ type: 'ch', ch: list[i] });
    }
    rows = out;
    rowsVersion++;
    if (out.length) {
      hide(el.emptyText);
    } else {
      el.emptyText.textContent = q ? T.emptySearch : (tab === TAB_FAV ? T.emptyFav : '');
      if (el.emptyText.textContent) show(el.emptyText); else hide(el.emptyText);
    }
    renderTabs();
    renderList(true);
  }

  function indexOfCurrent() {
    if (!current) return -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].type === 'ch' && rows[i].ch.name === current.name) return i;
    }
    return -1;
  }

  function measureList() {
    var h = el.list.clientHeight;
    var step = remPx(4.5);
    visibleRows = Math.max(3, Math.floor(h / step));
  }

  function focusRow(index) {
    if (!rows.length) {
      setFocusIndex(-1);
      return;
    }
    var i = clamp(index, 0, rows.length - 1);
    topIndex = Math.max(0, i - 2);
    setFocusIndex(i);
  }

  function setFocusIndex(i) {
    focusIndex = i;
    if (focusIndex >= 0) {
      if (focusIndex < topIndex + 2) topIndex = Math.max(0, focusIndex - 2);
      if (focusIndex > topIndex + visibleRows - 3) topIndex = focusIndex - visibleRows + 3;
    }
    topIndex = clamp(topIndex, 0, Math.max(0, rows.length - visibleRows));
    if (focusIndex === -1) el.searchBox.classList.add('focused');
    else el.searchBox.classList.remove('focused');
    renderList(false);
  }

  function renderList(force) {
    if (force || topIndex !== renderedTop || rowsVersion !== renderedVersion) {
      el.list.innerHTML = '';
      var end = Math.min(rows.length, topIndex + visibleRows);
      for (var i = topIndex; i < end; i++) el.list.appendChild(buildRow(rows[i], i));
      renderedTop = topIndex;
      renderedVersion = rowsVersion;
    }
    var nodes = el.list.childNodes;
    for (var j = 0; j < nodes.length; j++) {
      var idx = parseInt(nodes[j].getAttribute('data-index'), 10);
      if (idx === focusIndex && (mode === 'panel' || mode === 'menu')) nodes[j].classList.add('focused');
      else nodes[j].classList.remove('focused');
    }
  }

  function buildRow(row, index) {
    var r = document.createElement('div');
    r.className = 'row';
    r.setAttribute('data-index', String(index));
    var num = document.createElement('div');
    num.className = 'num';
    r.appendChild(num);
    if (row.type === 'ch') {
      var ch = row.ch;
      var playing = sameChannel(ch, current);
      if (playing) r.classList.add('playing');
      num.textContent = String(ch.number);
      var badge = document.createElement('div');
      badge.className = 'badge';
      var ini = document.createElement('div');
      ini.className = 'initials';
      var img = document.createElement('img');
      img.className = 'logo';
      img.alt = '';
      badge.appendChild(ini);
      badge.appendChild(img);
      r.appendChild(badge);
      setBadge(ini, img, ch);
      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = ch.name;
      r.appendChild(name);
      if (playing) r.appendChild(svg('bars', '0 0 24 24', BARS));
      if (isFav(ch)) r.appendChild(svg('star', '0 0 24 24', [STAR]));
    } else {
      num.className = 'num blank';
      var title = document.createElement('div');
      title.className = 'name';
      title.textContent = row.title;
      r.appendChild(title);
    }
    r.addEventListener('mouseenter', onRowHover);
    r.addEventListener('click', onRowClick);
    return r;
  }

  function onRowHover(e) {
    if (mode !== 'panel') return;
    var i = parseInt(e.currentTarget.getAttribute('data-index'), 10);
    if (!isNaN(i) && i !== focusIndex) {
      focusIndex = i;
      el.searchBox.classList.remove('focused');
      renderList(false);
    }
    bumpPanelTimer();
  }

  function onRowClick(e) {
    if (mode !== 'panel') return;
    var i = parseInt(e.currentTarget.getAttribute('data-index'), 10);
    if (isNaN(i)) return;
    focusIndex = i;
    activateRow(i);
  }

  // ---------- Список: открыть, закрыть, действия ----------

  function openPanel() {
    if (!channels.length) return;
    if (pendingIndex >= 0) commitSwitch();
    hideOsd();
    hiddenMode = false;
    if (tabs[tabIndex] === TAB_SETTINGS) {
      var last = tabs.indexOf(prefs.lastTab || TAB_ALL);
      tabIndex = last >= 0 && tabs[last] !== TAB_SETTINGS ? last : tabs.indexOf(TAB_ALL);
    }
    mode = 'panel';
    shiftOverlays(true);
    show(el.panel);
    measureList();
    refreshRows();
    var idx = indexOfCurrent();
    focusRow(idx >= 0 ? idx : 0);
    bumpPanelTimer();
  }

  function closePanel() {
    if (mode !== 'panel' && mode !== 'menu') return;
    clearTimeout(timers.panel);
    closeMenu();
    hiddenMode = false;
    el.searchInput.blur();
    hide(el.panel);
    shiftOverlays(false);
    clearSearch();
    mode = 'watch';
  }

  function clearSearch() {
    el.searchInput.value = '';
  }

  function bumpPanelTimer() {
    clearTimeout(timers.panel);
    if (mode !== 'panel' && mode !== 'menu') return;
    timers.panel = later(function () {
      if (document.activeElement === el.searchInput) bumpPanelTimer();
      else closePanel();
    }, PANEL_IDLE_MS);
  }

  function activateRow(i) {
    var row = rows[i];
    if (!row) return;
    if (row.type === 'ch') {
      prefs.lastTab = query() ? TAB_ALL : tabs[tabIndex];
      storage.set('tab', prefs.lastTab);
      var playingNow = sameChannel(row.ch, current) && !video.paused && video.readyState >= 3;
      closePanel();
      if (playingNow) showOsd(row.ch);
      else play(row.ch, true);
    } else if (row.type === 'action') {
      if (row.id === ACTION_REFRESH) {
        closePanel();
        refresh(true);
      } else if (row.id === ACTION_CHANGE) {
        closePanel();
        openSetup();
      } else if (row.id === ACTION_HIDDEN) {
        hiddenMode = true;
        refreshRows();
        focusRow(0);
      } else if (row.id === ACTION_UNHIDE_ALL) {
        prefs.hidden = {};
        prefs.hiddenGroups = {};
        saveHidden();
        showToast(T.restoredAll);
        hiddenMode = false;
        afterHiddenChanged(0);
      }
    } else if (row.type === 'restore') {
      if (row.group) delete prefs.hiddenGroups[row.key];
      else delete prefs.hidden[row.key];
      saveHidden();
      showToast(fmt(T.restored, row.key));
      if (hiddenCount() === 0) hiddenMode = false;
      afterHiddenChanged(i);
    }
  }

  function afterHiddenChanged(position) {
    buildTabs();
    refreshRows();
    focusRow(position);
  }

  // ---------- Меню канала ----------

  function openMenu(ch) {
    menuChannel = ch;
    menuReturn = focusIndex;
    el.menuTitle.textContent = ch.name;
    menuItems = [
      { id: 'fav', title: isFav(ch) ? T.menuUnfav : T.menuFav },
      { id: 'hide', title: T.menuHide }
    ];
    if (ch.group) menuItems.push({ id: 'group', title: fmt(T.menuHideGroup, ch.group) });
    el.menuItems.innerHTML = '';
    for (var i = 0; i < menuItems.length; i++) {
      var item = document.createElement('div');
      item.className = 'menu-item';
      item.textContent = menuItems[i].title;
      item.setAttribute('data-index', String(i));
      item.addEventListener('mouseenter', onMenuHover);
      item.addEventListener('click', onMenuClick);
      el.menuItems.appendChild(item);
    }
    menuFocus = 0;
    mode = 'menu';
    show(el.menu);
    renderMenu();
    bumpPanelTimer();
  }

  function renderMenu() {
    var nodes = el.menuItems.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      if (i === menuFocus) nodes[i].classList.add('focused');
      else nodes[i].classList.remove('focused');
    }
  }

  function onMenuHover(e) {
    var i = parseInt(e.currentTarget.getAttribute('data-index'), 10);
    if (!isNaN(i)) {
      menuFocus = i;
      renderMenu();
    }
  }

  function onMenuClick(e) {
    var i = parseInt(e.currentTarget.getAttribute('data-index'), 10);
    if (!isNaN(i)) {
      menuFocus = i;
      activateMenu();
    }
  }

  function closeMenu() {
    hide(el.menu);
    menuChannel = null;
    if (mode === 'menu') mode = 'panel';
  }

  function activateMenu() {
    var ch = menuChannel;
    var item = menuItems[menuFocus];
    var position = menuReturn;
    closeMenu();
    if (!ch || !item) return;
    if (item.id === 'fav') {
      toggleFavorite(ch);
      refreshRows();
      focusRow(position);
    } else if (item.id === 'hide') {
      prefs.hidden[ch.name] = true;
      saveHidden();
      showToast(fmt(T.hiddenChannel, ch.name));
      afterHiddenChanged(position);
    } else if (item.id === 'group' && ch.group) {
      prefs.hiddenGroups[ch.group] = true;
      saveHidden();
      showToast(fmt(T.hiddenGroup, ch.group));
      afterHiddenChanged(position);
    }
  }

  // ---------- Подключение плейлиста ----------

  function openSetup() {
    mode = 'setup';
    hideOsd();
    hide(el.panel);
    hide(el.menu);
    shiftOverlays(false);
    clearTimeout(timers.retry);
    clearTimeout(timers.start);
    stopVideo();
    hide(el.spinner);
    hideStatus();
    el.urlInput.value = prefs.url && prefs.url !== LOCAL ? prefs.url : '';
    hide(el.setupStatus);
    show(el.setup);
    setSetupFocus(0);
    startPhoneServer();
  }

  function closeSetup() {
    stopPhoneServer();
    el.urlInput.blur();
    hide(el.setup);
    mode = 'watch';
  }

  function setSetupFocus(i) {
    setupFocus = i;
    if (i === 0) el.urlInput.classList.add('focused'); else el.urlInput.classList.remove('focused');
    if (i === 1) el.loadBtn.classList.add('focused'); else el.loadBtn.classList.remove('focused');
  }

  function setupMessage(text, error) {
    el.setupStatus.textContent = text;
    if (error) el.setupStatus.classList.add('error'); else el.setupStatus.classList.remove('error');
    show(el.setupStatus);
  }

  function renderQr(text) {
    try {
      var q = window.qrcode(0, 'M');
      q.addData(text);
      q.make();
      el.qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      el.qr.textContent = '';
    }
  }

  function pickIp(ips) {
    if (!ips || !ips.length) return null;
    for (var i = 0; i < ips.length; i++) {
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ips[i])) return ips[i];
    }
    return ips[0];
  }

  function startPhoneServer() {
    el.qr.innerHTML = '';
    if (!hasService()) {
      el.serverAddress.textContent = T.noPhone;
      return;
    }
    stopPhoneServer();
    var bridge = luna('server', { subscribe: true }, function (r) {
      if (bridge !== serverBridge) return;
      if (!r.returnValue) {
        el.serverAddress.textContent = T.noPhone;
        return;
      }
      if (r.event === 'ready') {
        var ip = pickIp(r.ips);
        if (!ip) {
          el.serverAddress.textContent = T.noNetwork;
          return;
        }
        renderQr('http://' + ip + ':' + r.port);
        el.serverAddress.textContent = fmt(T.browserAddress, ip + ':' + r.port);
      } else if (r.event === 'url' && r.url) {
        el.urlInput.value = r.url;
        setupMessage(T.received, false);
        loadUrl(r.url);
      } else if (r.event === 'file' && r.id) {
        setupMessage(T.fileReceived, false);
        collectChunks(r.id, r.chunks, r.first, function (err, bytes) {
          if (err) {
            setupMessage(T.errorParse, true);
            return;
          }
          acceptPlaylist(decodeBytes(bytes), LOCAL);
        });
      }
    });
    serverBridge = bridge;
  }

  function stopPhoneServer() {
    if (serverBridge) {
      releaseBridge(serverBridge);
      serverBridge = null;
    }
  }

  function loadUrl(input) {
    if (setupBusy) return;
    var url = normalizeUrl(input);
    if (!url) {
      setupMessage(T.errorEmpty, true);
      return;
    }
    setupBusy = true;
    setupMessage(T.loading, false);
    loadPlaylistText(url, function (err, text) {
      setupBusy = false;
      if (err) {
        setupMessage(T.errorLoad, true);
        return;
      }
      acceptPlaylist(text, url);
    });
  }

  function acceptPlaylist(text, source) {
    var list = parseM3u(text);
    if (!list.length) {
      setupMessage(T.errorParse, true);
      return;
    }
    prefs.url = source;
    storage.set('url', source);
    saveCache(text);
    closeSetup();
    current = null;
    applyPlaylist(list);
  }

  // ---------- Пульт ----------

  function digitOf(code) {
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 96 && code <= 105) return code - 96;
    return -1;
  }

  function isBack(code) { return code === KEY.BACK || code === KEY.ESC; }

  function onKeyDown(e) {
    var code = e.keyCode;
    var inInput = document.activeElement === el.urlInput || document.activeElement === el.searchInput;

    if (inInput) {
      handleInputKey(e, code);
      return;
    }
    if (mode === 'panel' || mode === 'menu') bumpPanelTimer();

    if (code === KEY.OK) {
      e.preventDefault();
      // Повтор при удержании пропускаем; «зависшее» нажатие (потерянный keyup) сбрасываем через 3 с
      if (okDownMode !== null && Date.now() - okDownTime < 3000) return;
      if (timers.ok) clearTimeout(timers.ok);
      okDownMode = mode;
      okDownTime = Date.now();
      okLong = false;
      var canHold = mode === 'watch' || (mode === 'panel' && focusIndex >= 0 && rows[focusIndex] && rows[focusIndex].type === 'ch');
      if (canHold) {
        timers.ok = later(function () {
          timers.ok = null;
          okLong = true;
          onOkLong();
        }, OK_LONG_MS);
      }
      return;
    }
    if (code === KEY.BACKSPACE) code = KEY.BACK; // удобно при проверке на компьютере

    var handled = true;
    if (mode === 'setup') handled = setupKey(code);
    else if (mode === 'menu') handled = menuKey(code);
    else if (mode === 'panel') handled = panelKey(code);
    else handled = watchKey(code);
    if (handled) e.preventDefault();
  }

  function onKeyUp(e) {
    if (e.keyCode !== KEY.OK) return;
    if (document.activeElement === el.urlInput || document.activeElement === el.searchInput) return;
    e.preventDefault();
    var downMode = okDownMode;
    okDownMode = null;
    if (timers.ok) {
      clearTimeout(timers.ok);
      timers.ok = null;
    }
    if (okLong) {
      okLong = false;
      return;
    }
    if (downMode !== mode) return;
    onOkShort();
  }

  function onOkShort() {
    if (mode === 'setup') {
      if (setupFocus === 0) el.urlInput.focus();
      else loadUrl(el.urlInput.value);
    } else if (mode === 'menu') {
      activateMenu();
    } else if (mode === 'panel') {
      if (focusIndex === -1) el.searchInput.focus();
      else activateRow(focusIndex);
    } else if (dial) {
      commitDial();
    } else {
      openPanel();
    }
  }

  function onOkLong() {
    if (mode === 'watch') {
      if (current) toggleFavorite(current);
    } else if (mode === 'panel') {
      var row = rows[focusIndex];
      if (row && row.type === 'ch') openMenu(row.ch);
    }
  }

  function handleInputKey(e, code) {
    var input = document.activeElement;
    if (code === KEY.OK) {
      e.preventDefault();
      input.blur();
      if (input === el.urlInput) {
        setSetupFocus(1);
        loadUrl(el.urlInput.value);
      } else {
        focusRow(0);
      }
      return;
    }
    if (code === KEY.DOWN || code === KEY.UP || isBack(code)) {
      e.preventDefault();
      input.blur();
      if (input === el.urlInput) {
        setSetupFocus(code === KEY.DOWN ? 1 : 0);
      } else if (code === KEY.DOWN) {
        focusRow(0);
      } else {
        setFocusIndex(-1);
      }
      return;
    }
    if (input === el.searchInput && (code === KEY.LEFT || code === KEY.RIGHT) && !query()) {
      e.preventDefault();
      input.blur();
      switchTab(code === KEY.LEFT ? -1 : 1);
    }
  }

  function setupKey(code) {
    if (code === KEY.UP) setSetupFocus(0);
    else if (code === KEY.DOWN) setSetupFocus(1);
    else if (isBack(code)) {
      if (channels.length) {
        closeSetup();
        if (current) startPlayback(current);
      } else {
        exitApp();
      }
    } else return false;
    return true;
  }

  function menuKey(code) {
    if (code === KEY.UP) {
      menuFocus = Math.max(0, menuFocus - 1);
      renderMenu();
    } else if (code === KEY.DOWN) {
      menuFocus = Math.min(menuItems.length - 1, menuFocus + 1);
      renderMenu();
    } else if (isBack(code) || code === KEY.RED) {
      var position = menuReturn;
      closeMenu();
      focusRow(position);
    }
    return true;
  }

  function panelKey(code) {
    if (code === KEY.UP) {
      if (focusIndex > 0) setFocusIndex(focusIndex - 1);
      else setFocusIndex(-1);
    } else if (code === KEY.DOWN) {
      if (focusIndex < rows.length - 1) setFocusIndex(focusIndex + 1);
    } else if (code === KEY.LEFT || code === KEY.RIGHT) {
      switchTab(code === KEY.LEFT ? -1 : 1);
    } else if (code === KEY.PAGE_UP || code === KEY.CH_UP) {
      if (rows.length) focusRow(Math.max(0, focusIndex) - PAGE);
    } else if (code === KEY.PAGE_DOWN || code === KEY.CH_DOWN) {
      if (rows.length) focusRow(Math.max(0, focusIndex) + PAGE);
    } else if (code === KEY.RED) {
      var row = rows[focusIndex];
      if (row && row.type === 'ch') openMenu(row.ch);
    } else if (isBack(code)) {
      if (query()) {
        clearSearch();
        refreshRows();
        var idx = indexOfCurrent();
        focusRow(idx >= 0 ? idx : 0);
      } else if (hiddenMode) {
        hiddenMode = false;
        refreshRows();
        focusRow(2);
      } else {
        closePanel();
      }
    } else if (code === KEY.GUIDE) {
      closePanel();
    } else {
      return false;
    }
    return true;
  }

  function watchKey(code) {
    var digit = digitOf(code);
    if (digit >= 0) {
      onDigit(digit);
      return true;
    }
    if (code === KEY.UP) switchChannel(-1);
    else if (code === KEY.DOWN) switchChannel(1);
    else if (code === KEY.PAGE_UP || code === KEY.CH_UP) switchChannel(1);
    else if (code === KEY.PAGE_DOWN || code === KEY.CH_DOWN) switchChannel(-1);
    else if (code === KEY.LEFT || code === KEY.GUIDE) openPanel();
    else if (code === KEY.RIGHT || code === KEY.INFO) {
      if (current) showOsd(current);
    } else if (code === KEY.RED) {
      if (current) toggleFavorite(current);
    } else if (code === KEY.PLAY || code === KEY.PAUSE || code === KEY.PLAY_PAUSE) {
      if (code === KEY.PAUSE || (code === KEY.PLAY_PAUSE && !video.paused)) video.pause();
      else playVideo();
    } else if (isBack(code)) {
      onWatchBack();
    } else {
      return false;
    }
    return true;
  }

  function onWatchBack() {
    if (dial) {
      cancelDial();
      return;
    }
    var now = Date.now();
    if (now - lastBack < BACK_EXIT_MS) {
      exitApp();
    } else {
      lastBack = now;
      hideOsd();
      showToast(T.pressBack);
    }
  }

  function exitApp() {
    stopVideo();
    stopPhoneServer();
    try { window.close(); } catch (e) { /* не webOS */ }
  }

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);

  // ---------- Мышь и пульт-указка Magic Remote ----------

  el.searchInput.addEventListener('input', function () {
    if (mode === 'panel') {
      refreshRows();
      setFocusIndex(-1);
    }
  });
  el.searchInput.addEventListener('focus', function () {
    if (mode === 'panel') setFocusIndex(-1);
  });
  el.urlInput.addEventListener('focus', function () { setSetupFocus(0); });
  el.loadBtn.addEventListener('click', function () {
    setSetupFocus(1);
    loadUrl(el.urlInput.value);
  });
  el.loadBtn.addEventListener('mouseenter', function () { setSetupFocus(1); });
  el.list.addEventListener('wheel', function (e) {
    if (mode !== 'panel') return;
    e.preventDefault();
    if (e.deltaY > 0 && focusIndex < rows.length - 1) setFocusIndex(focusIndex + 1);
    else if (e.deltaY < 0 && focusIndex > 0) setFocusIndex(focusIndex - 1);
    bumpPanelTimer();
  });
  video.addEventListener('click', function () {
    if (mode === 'watch') openPanel();
    else if (mode === 'panel') closePanel();
  });
  el.menu.addEventListener('click', function (e) {
    if (e.target === el.menu) {
      var position = menuReturn;
      closeMenu();
      focusRow(position);
    }
  });

  window.addEventListener('resize', function () {
    if (mode === 'panel' || mode === 'menu') {
      measureList();
      renderList(true);
    }
  });

  // ---------- Запуск ----------

  function init() {
    if (!prefs.url) {
      openSetup();
      return;
    }
    var cached = storage.getRaw('cache');
    var list = cached ? parseM3u(cached) : [];
    if (list.length) {
      applyPlaylist(list);
      refresh(false);
      return;
    }
    if (prefs.url === LOCAL) {
      openSetup();
      return;
    }
    show(el.spinner);
    loadPlaylistText(prefs.url, function (err, text) {
      hide(el.spinner);
      var fresh = err ? [] : parseM3u(text);
      if (!fresh.length) {
        openSetup();
        return;
      }
      saveCache(text);
      applyPlaylist(fresh);
    });
  }

  // Для проверки в браузере: доступ к разбору плейлиста
  window.EFIR = { parseM3u: parseM3u, initials: initials, decodeBytes: decodeBytes };

  init();
})();
