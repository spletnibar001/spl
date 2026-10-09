package uz.efir.tv

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.Collections

/**
 * Маленький веб-сервер на телевизоре: телефон открывает страницу по QR-коду
 * и отправляет ссылку на плейлист или сам файл .m3u.
 */
class LocalServer(
    private val page: String,
    private val onUrl: (String) -> Unit,
    private val onPlaylist: (String) -> Unit
) {
    private var server: ServerSocket? = null
    @Volatile
    private var running = false

    var port: Int = 0
        private set

    fun start(): Boolean {
        for (p in 8080..8090) {
            try {
                val s = ServerSocket()
                s.reuseAddress = true
                s.bind(InetSocketAddress(p))
                server = s
                port = p
                break
            } catch (e: IOException) {
                // порт занят - пробуем следующий
            }
        }
        val s = server ?: return false
        running = true
        Thread({
            while (running) {
                try {
                    val client = s.accept()
                    Thread({ handle(client) }, "efir-http-client").start()
                } catch (e: IOException) {
                    if (!running) break
                }
            }
        }, "efir-http").start()
        return true
    }

    fun stop() {
        running = false
        try {
            server?.close()
        } catch (e: IOException) {
            // уже закрыт
        }
        server = null
    }

    private fun handle(socket: Socket) {
        try {
            socket.soTimeout = 20_000
            val input = BufferedInputStream(socket.getInputStream())
            val out = socket.getOutputStream()
            val requestLine = readLine(input) ?: return
            val parts = requestLine.split(' ')
            if (parts.size < 2) return
            val method = parts[0].uppercase()
            val path = parts[1]

            var length = 0
            while (true) {
                val header = readLine(input) ?: break
                if (header.isEmpty()) break
                val colon = header.indexOf(':')
                if (colon > 0 && header.substring(0, colon).trim().equals("Content-Length", ignoreCase = true)) {
                    length = header.substring(colon + 1).trim().toIntOrNull() ?: 0
                }
            }
            val body = if (method == "POST" && length > 0) readBody(input, minOf(length, MAX_BODY)) else ByteArray(0)

            when {
                method == "POST" && path.startsWith("/url") -> {
                    val url = parseForm(String(body, Charsets.UTF_8))["url"]?.trim().orEmpty()
                    if (url.isNotEmpty()) {
                        respond(out, 200, "OK", "text/plain; charset=utf-8")
                        onUrl(url)
                    } else {
                        respond(out, 400, "EMPTY", "text/plain; charset=utf-8")
                    }
                }
                method == "POST" && path.startsWith("/file") -> {
                    val text = PlaylistLoader.decode(body)
                    if (M3uParser.parse(text).isNotEmpty()) {
                        respond(out, 200, "OK", "text/plain; charset=utf-8")
                        onPlaylist(text)
                    } else {
                        respond(out, 400, "NO_CHANNELS", "text/plain; charset=utf-8")
                    }
                }
                path.startsWith("/favicon") -> respond(out, 404, "", "text/plain")
                else -> respond(out, 200, page, "text/html; charset=utf-8")
            }
        } catch (e: Exception) {
            // клиент оборвал соединение - ничего страшного
        } finally {
            try {
                socket.close()
            } catch (e: IOException) {
                // уже закрыт
            }
        }
    }

    private fun readLine(input: InputStream): String? {
        val buf = ByteArrayOutputStream()
        while (true) {
            val b = input.read()
            if (b == -1) return if (buf.size() == 0) null else buf.toString("ISO-8859-1")
            if (b == '\n'.code) break
            if (b != '\r'.code) buf.write(b)
            if (buf.size() > 16_384) break
        }
        return buf.toString("ISO-8859-1")
    }

    private fun readBody(input: InputStream, length: Int): ByteArray {
        val data = ByteArray(length)
        var read = 0
        while (read < length) {
            val n = input.read(data, read, length - read)
            if (n == -1) break
            read += n
        }
        return if (read == length) data else data.copyOf(read)
    }

    private fun parseForm(body: String): Map<String, String> {
        val result = HashMap<String, String>()
        for (pair in body.split('&')) {
            if (pair.isEmpty()) continue
            val key = pair.substringBefore('=')
            val value = pair.substringAfter('=', "")
            try {
                result[URLDecoder.decode(key, "UTF-8")] = URLDecoder.decode(value, "UTF-8")
            } catch (e: Exception) {
                // битая пара - пропускаем
            }
        }
        return result
    }

    private fun respond(out: OutputStream, code: Int, body: String, type: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val status = when (code) {
            200 -> "OK"
            400 -> "Bad Request"
            else -> "Not Found"
        }
        val head = "HTTP/1.1 $code $status\r\n" +
            "Content-Type: $type\r\n" +
            "Content-Length: ${bytes.size}\r\n" +
            "Cache-Control: no-store\r\n" +
            "Connection: close\r\n\r\n"
        out.write(head.toByteArray(Charsets.ISO_8859_1))
        out.write(bytes)
        out.flush()
    }

    companion object {
        private const val MAX_BODY = 30 * 1024 * 1024

        /** IP телевизора в домашней сети (Wi-Fi или кабель). */
        fun localIp(): String? {
            return try {
                val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
                val candidates = ArrayList<Pair<String, String>>()
                for (nif in Collections.list(interfaces)) {
                    if (!nif.isUp || nif.isLoopback) continue
                    for (addr in Collections.list(nif.inetAddresses)) {
                        if (addr is Inet4Address && !addr.isLoopbackAddress) {
                            val ip = addr.hostAddress ?: continue
                            candidates.add(Pair(nif.name ?: "", ip))
                        }
                    }
                }
                val preferred = candidates.firstOrNull { (name, ip) ->
                    (name.startsWith("wlan") || name.startsWith("eth")) && isPrivate(ip)
                } ?: candidates.firstOrNull { isPrivate(it.second) } ?: candidates.firstOrNull()
                preferred?.second
            } catch (e: Exception) {
                null
            }
        }

        private fun isPrivate(ip: String): Boolean {
            if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true
            if (ip.startsWith("172.")) {
                val second = ip.split('.').getOrNull(1)?.toIntOrNull() ?: return false
                return second in 16..31
            }
            return false
        }
    }
}
