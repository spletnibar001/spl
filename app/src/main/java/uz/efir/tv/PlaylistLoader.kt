package uz.efir.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/** Загрузка плейлиста по ссылке. */
object PlaylistLoader {

    const val USER_AGENT =
        "Mozilla/5.0 (Linux; Android 11; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

    /** Добавляет http://, если ссылку ввели без протокола. */
    fun normalize(input: String): String {
        val url = input.trim()
        if (url.isEmpty()) return url
        return if (url.contains("://")) url else "http://$url"
    }

    suspend fun fetch(source: String): String = withContext(Dispatchers.IO) {
        var current = source
        var hops = 0
        var text: String? = null
        while (text == null) {
            val conn = URL(current).openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 15_000
                conn.readTimeout = 30_000
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("User-Agent", USER_AGENT)
                conn.setRequestProperty("Accept", "*/*")
                val code = conn.responseCode
                if (code in 300..399) {
                    val location = conn.getHeaderField("Location")
                        ?: throw IOException("Redirect without location")
                    current = URL(URL(current), location).toString()
                    hops++
                    if (hops > 6) throw IOException("Too many redirects")
                } else if (code in 200..299) {
                    val raw: InputStream = conn.inputStream
                    val stream = if ("gzip".equals(conn.contentEncoding, ignoreCase = true)) {
                        GZIPInputStream(raw)
                    } else {
                        raw
                    }
                    val bytes = stream.use { it.readBytes() }
                    text = decode(bytes)
                } else {
                    throw IOException("HTTP $code")
                }
            } finally {
                conn.disconnect()
            }
        }
        text ?: throw IOException("Empty playlist")
    }

    /** UTF-8, а если текст в нём не читается - Windows-1251 (встречается у старых плейлистов). */
    fun decode(bytes: ByteArray): String {
        val utf = String(bytes, Charsets.UTF_8)
        if (!utf.contains('�')) return utf
        return try {
            String(bytes, charset("windows-1251"))
        } catch (e: Exception) {
            utf
        }
    }
}
