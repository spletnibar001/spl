package uz.efir.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream
import java.util.zip.ZipInputStream

/** Загрузка плейлиста по ссылке. */
object PlaylistLoader {

    const val USER_AGENT =
        "Mozilla/5.0 (Linux; Android 11; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

    private const val MAX_BYTES = 50 * 1024 * 1024

    /** Добавляет http://, если ссылку ввели без протокола. */
    fun normalize(input: String): String {
        val url = input.trim()
        if (url.isEmpty()) return url
        return if (url.contains("://")) url else "http://$url"
    }

    suspend fun fetch(source: String): String =
        extractPlaylist(fetchBytes(source, USER_AGENT, emptyMap()))

    suspend fun fetchBytes(
        source: String,
        userAgent: String,
        headers: Map<String, String>
    ): ByteArray = withContext(Dispatchers.IO) {
        var current = source
        var hops = 0
        var result: ByteArray? = null
        while (result == null) {
            val conn = URL(current).openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 15_000
                conn.readTimeout = 30_000
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("User-Agent", userAgent)
                conn.setRequestProperty("Accept", "*/*")
                for ((name, value) in headers) conn.setRequestProperty(name, value)
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
                    result = stream.use { readLimited(it) }
                } else {
                    throw IOException("HTTP $code")
                }
            } finally {
                conn.disconnect()
            }
        }
        result ?: throw IOException("Empty response")
    }

    private fun readLimited(input: InputStream): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buffer)
            if (n == -1) break
            out.write(buffer, 0, n)
            if (out.size() > MAX_BYTES) throw IOException("File too large")
        }
        return out.toByteArray()
    }

    /** Текст плейлиста из скачанного файла; zip-архив тоже понимает (берёт .m3u внутри). */
    fun extractPlaylist(bytes: ByteArray): String {
        val isZip = bytes.size > 4 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()
        if (!isZip) return decode(bytes)
        var found: String? = null
        var fallback: String? = null
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            var entry = zip.nextEntry
            while (entry != null && found == null) {
                if (!entry.isDirectory) {
                    val text = decode(readLimited(zip))
                    val name = entry.name.lowercase()
                    if (name.endsWith(".m3u") || name.endsWith(".m3u8")) {
                        found = text
                    } else if (fallback == null && text.contains("#EXTINF")) {
                        fallback = text
                    }
                }
                entry = zip.nextEntry
            }
        }
        return found ?: fallback ?: ""
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
