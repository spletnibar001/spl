#!/usr/bin/env bash
# Проверка ЭФИРа на эмуляторе Android TV: настройка с «телефона», просмотр, список, избранное, набор номера.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$PWD/shots"
mkdir -p "$OUT"

shot() {
  sleep "${2:-1}"
  adb exec-out screencap -p > "$OUT/$1.png"
  echo "shot $1"
}
key() {
  adb shell input keyevent "$@"
  sleep 0.4
}

# Тестовый поток MPEG-TS без расширения в ссылке (как у многих IPTV)
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -loglevel error -y -f lavfi -i testsrc=size=1280x720:rate=25 -f lavfi -i sine=frequency=440 \
    -t 120 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -f mpegts "$HERE/stream-no-ext"
fi

(cd "$HERE" && nohup python3 -m http.server 8000 > "$OUT/http.log" 2>&1 &)
sleep 2

adb logcat -c
adb install -r efir.apk
adb shell am start -n uz.efir.tv/.MainActivity
shot 01-setup 8

# «Телефон» отправляет ссылку на телевизор
adb forward tcp:8080 tcp:8080
curl -s -m 10 http://127.0.0.1:8080/ -o "$OUT/phone-page.html"
echo "url post: $(curl -s -m 10 -X POST -d 'url=http://10.0.2.2:8000/test.m3u' http://127.0.0.1:8080/url)"
shot 02-start-playing 4
shot 03-playing 12

key KEYCODE_DPAD_CENTER
shot 04-list 2

key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_DOWN
shot 05-list-focus 1

adb shell input keyevent --longpress KEYCODE_DPAD_CENTER
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
shot 11-osd-switch 0.6
shot 12-after-switch 10

key KEYCODE_1
key KEYCODE_0
shot 13-dial 0.2
shot 14-channel-10-ts 14

key KEYCODE_4
shot 15-channel-4-broken 12

key KEYCODE_DPAD_CENTER
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
key KEYCODE_DPAD_UP
shot 16-search-focus 1
adb shell input text "yurt"
shot 17-search-typed 2
key KEYCODE_DPAD_DOWN
key KEYCODE_DPAD_CENTER
shot 18-search-picked 10

key KEYCODE_BACK
shot 19-back-once 0.5
key KEYCODE_BACK
shot 20-exited 2

# Перезапуск: должен сразу включиться последний канал
adb shell am start -n uz.efir.tv/.MainActivity
shot 21-relaunch 10

echo "pid after relaunch: $(adb shell pidof uz.efir.tv)"
adb logcat -d -v brief > "$OUT/logcat-full.txt"
grep -E "AndroidRuntime|FATAL|ExoPlayerImplInternal|uz.efir.tv" "$OUT/logcat-full.txt" | tail -200 > "$OUT/logcat.txt"
ls -la "$OUT"
exit 0
