#!/usr/bin/env bash
# Проверка ЭФИРа на эмуляторе Android TV: настройка с «телефона», просмотр, список,
# избранное, набор номера, поиск, смена плейлиста файлом, перезапуск.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$PWD/shots"
mkdir -p "$OUT"

shot() {
  sleep "${2:-1}"
  timeout 30 adb exec-out screencap -p > "$OUT/$1.png"
  echo "shot $1"
}
key() {
  timeout 30 adb shell input keyevent "$@"
  sleep 0.4
}

# Поток MPEG-TS по ссылке без расширения (как у многих IPTV) и плейлист-файл в Windows-1251
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -loglevel error -y -f lavfi -i testsrc=size=1280x720:rate=25 -f lavfi -i sine=frequency=440 \
    -t 180 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -f mpegts "$HERE/stream-no-ext"
fi
iconv -f utf-8 -t cp1251 "$HERE/file-utf8.m3u" > "$HERE/file-cp1251.m3u"

(cd "$HERE" && exec python3 -m http.server 8000 > "$OUT/http.log" 2>&1) &
HTTP_PID=$!
sleep 2

adb logcat -c
timeout 120 adb install -r efir.apk
adb shell am start -n uz.efir.tv/.MainActivity
shot 01-setup 8

# «Телефон» отправляет ссылку на телевизор
adb forward tcp:8080 tcp:8080
curl -s -m 10 http://127.0.0.1:8080/ -o "$OUT/phone-page.html"
echo "url post: $(curl -s -m 10 -X POST -d 'url=http://10.0.2.2:8000/test.m3u' http://127.0.0.1:8080/url)"
shot 02-start-osd 3
shot 03-playing 10

key KEYCODE_DPAD_CENTER
shot 04-list 2

key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_DOWN
shot 05-list-focus 1

timeout 30 adb shell input keyevent --longpress KEYCODE_DPAD_CENTER
shot 06-fav-added 1

key KEYCODE_DPAD_RIGHT
shot 07-tab-news 1

key KEYCODE_DPAD_LEFT
key KEYCODE_DPAD_LEFT
shot 08-tab-fav 1

key KEYCODE_DPAD_LEFT
shot 09-tab-settings 1

key KEYCODE_BACK
shot 10-closed 1

key KEYCODE_DPAD_DOWN
shot 11-osd-switch 0.3
shot 12-after-switch 10

# Набор номера 10 - поток TS без расширения
key KEYCODE_1 KEYCODE_0
shot 13-dial 0.1
shot 14-channel-10-ts 14

key KEYCODE_4
shot 15-channel-4-broken 12

# Список открывается на текущем канале, поиск по названию
key KEYCODE_DPAD_CENTER
shot 16-list-on-current 2
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
shot 17-search-focus 1
timeout 30 adb shell input text "yurt"
shot 18-search-typed 2
# НАЗАД прячет клавиатуру, дальше вниз - к результатам
key KEYCODE_BACK
key KEYCODE_DPAD_DOWN
shot 19-search-result-focus 1
key KEYCODE_DPAD_CENTER
shot 20-search-picked 8

# Смена плейлиста: Настройки -> Сменить плейлист -> файл с «телефона»
key KEYCODE_DPAD_CENTER
key KEYCODE_DPAD_LEFT
key KEYCODE_DPAD_LEFT
shot 21-settings 1
key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_CENTER
shot 22-change-setup 5
echo "file post: $(curl -s -m 20 -X POST --data-binary @"$HERE/file-cp1251.m3u" -H 'Content-Type: application/octet-stream' http://127.0.0.1:8080/file)"
shot 23-file-playing 10
key KEYCODE_DPAD_CENTER
shot 24-file-list 2
key KEYCODE_BACK

# Выход двойным НАЗАД и перезапуск: должен сразу включиться последний канал
key KEYCODE_BACK
shot 25-back-once 0.3
key KEYCODE_BACK
shot 26-exited 2
adb shell am start -n uz.efir.tv/.MainActivity
shot 27-relaunch-osd 2
shot 28-relaunch 8

echo "pid after relaunch: $(adb shell pidof uz.efir.tv)"
adb logcat -d -v brief > "$OUT/logcat-full.txt"
grep -E "AndroidRuntime|FATAL|ExoPlayerImplInternal|uz.efir.tv" "$OUT/logcat-full.txt" | tail -300 > "$OUT/logcat.txt"
kill "$HTTP_PID" 2>/dev/null
pkill -f "http.server 8000" 2>/dev/null
ls -la "$OUT"
exit 0
