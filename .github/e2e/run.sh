#!/usr/bin/env bash
# Проверка ЭФИРа на эмуляторе Android TV: настройка с «телефона», просмотр, список,
# меню канала (избранное, скрытие), набор номера, поиск, смена плейлиста файлом,
# выход и перезапуск, экран transfiles.
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
longok() {
  timeout 30 adb shell input keyevent --longpress KEYCODE_DPAD_CENTER
  sleep 0.6
}
hide_ime() {
  if timeout 20 adb shell dumpsys input_method | grep -q "mInputShown=true"; then
    key KEYCODE_BACK
  fi
}
note() {
  echo "$*" | tee -a "$OUT/checks.txt"
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
note "url post: $(curl -s -m 10 -X POST -d 'url=http://10.0.2.2:8000/test.m3u' http://127.0.0.1:8080/url)"
shot 02-start-osd 3
shot 03-playing 10

key KEYCODE_DPAD_CENTER
shot 04-list 2

key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_DOWN
shot 05-list-focus 1

# Удержание OK - меню канала, первый пункт - в избранное
longok
shot 06-menu 0.5
key KEYCODE_DPAD_CENTER
shot 06b-fav-added 1

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
hide_ime
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
note "file post: $(curl -s -m 20 -X POST --data-binary @"$HERE/file-cp1251.m3u" -H 'Content-Type: application/octet-stream' http://127.0.0.1:8080/file)"
shot 23-file-playing 10
key KEYCODE_DPAD_CENTER
shot 24-file-list 2

# Скрыть канал через меню и найти его в Настройках
key KEYCODE_DPAD_DOWN
longok
shot 24b-menu 0.5
key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_CENTER
shot 24c-hidden 1
key KEYCODE_DPAD_LEFT
key KEYCODE_DPAD_LEFT
shot 24d-settings-hidden 1
key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_CENTER
shot 24e-hidden-list 1
key KEYCODE_BACK
key KEYCODE_BACK

# Выход двойным НАЗАД и перезапуск: должен сразу включиться последний канал
key KEYCODE_BACK
shot 25-back-once 0.3
key KEYCODE_BACK KEYCODE_BACK
shot 26-exited 2
note "pid after exit: $(adb shell pidof uz.efir.tv) top: $(adb shell dumpsys activity activities | grep -m1 -E 'mResumedActivity|topResumedActivity')"
adb shell am start -n uz.efir.tv/.MainActivity
shot 27-relaunch-osd 2
shot 28-relaunch 8
note "pid after relaunch: $(adb shell pidof uz.efir.tv)"

# Код transfiles: Настройки -> Сменить плейлист -> поле кода -> страница сайта
key KEYCODE_DPAD_CENTER
key KEYCODE_DPAD_LEFT
key KEYCODE_DPAD_LEFT
key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_CENTER
shot 29-setup-code 4
key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_DOWN
timeout 30 adb shell input text "q0z0q"
hide_ime
shot 30-code-typed 1
key KEYCODE_DPAD_RIGHT
key KEYCODE_DPAD_CENTER
shot 31-transfiles 14
key KEYCODE_BACK
shot 32-back-to-setup 2

adb logcat -d -v brief > "$OUT/logcat-full.txt"
grep -E "AndroidRuntime|FATAL|ExoPlayerImplInternal|uz.efir.tv|chromium" "$OUT/logcat-full.txt" | tail -300 > "$OUT/logcat.txt"
kill "$HTTP_PID" 2>/dev/null
pkill -f "http.server 8000" 2>/dev/null
ls -la "$OUT"
exit 0
