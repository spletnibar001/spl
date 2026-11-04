package uz.efir.tv

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.BufferedInputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.zip.GZIPInputStream

/** Одна передача. Время - миллисекунды UTC. */
data class Programme(val start: Long, val stop: Long, val title: String, val desc: String)

/** Текущая и следующая передачи канала. */
data class NowNext(val now: Programme?, val next: Programme?)

/**
 * Телепрограмма (XMLTV): те же правила, что и в службе для webOS (webos/service/epg.js).
 * Имена каналов сравниваются без «HD», «orig», знаков препинания; «ТНТ +4» - это ТНТ со сдвигом на 4 часа.
 */
object EpgNames {
    data class Norm(val key: String, val shift: Int)

    private val country = Regex("\\s+[A-Z]{2}$")
    private val brackets = Regex("\\([^)]*\\)")
    private val spaces = Regex("[\\s\\u00a0]+")
    private val timeShift = Regex("\\s*\\+\\s?(\\d{1,2})$")
    private val tailWords = Regex("\\s+(hd|fhd|uhd|sd|hdr|4k|8k|orig|original|50|50fps|hevc|h265|\\+0)$")
    private val punctuation = Regex("[!?.,:;'\"«»„“”`’\\-–—_/\\\\|*#&]+")
    private val trailingPlus = Regex("\\s+\\+$")
    private val innerPlus = Regex("\\s*\\+\\s*")

    fun norm(name: String): Norm {
        var s = country.replace(name, "")
        s = s.lowercase(Locale.ROOT).replace('ё', 'е')
        s = brackets.replace(s, " ")
        s = spaces.replace(s, " ").trim()
        var shift = 0
        while (true) {
            val prev = s
            val m = timeShift.find(s)
            if (m != null) {
                if (shift == 0) shift = m.groupValues[1].toInt()
                s = s.substring(0, m.range.first).trim()
            }
            s = tailWords.replace(s, "").trim()
            if (s == prev) break
        }
        s = punctuation.replace(s, " ")
        s = s.replace(Regex(" +"), " ").trim()
        s = trailingPlus.replace(s, "+")
        s = innerPlus.replace(s, "+")
        return Norm(s, shift)
    }

    fun keys(name: String): List<String> {
        val n = norm(name).key
        if (n.isEmpty()) return emptyList()
        val compact = n.replace(" ", "")
        return if (compact != n) listOf(n, compact) else listOf(n)
    }

    /** Подпись набора каналов: меняется, когда в плейлисте другие каналы. */
    fun signature(names: Collection<String>): String {
        val keys = names.map { norm(it).key }.sorted()
        return "${keys.size}:${keys.joinToString("|").hashCode()}"
    }
}

/** Программа, собранная под плейлист. */
class EpgIndex(
    val updated: Long,
    private val chan: Map<String, List<Programme>>,
    private val alias: Map<String, String>
) {
    val channelCount: Int get() = chan.size

    private class Found(val list: List<Programme>, val shift: Long)

    private fun find(name: String): Found? {
        val n = EpgNames.norm(name)
        for (k in EpgNames.keys(name)) {
            val key = alias[k] ?: k
            val list = chan[key]
            if (list != null) return Found(list, n.shift * 3_600_000L)
        }
        return null
    }

    private fun Programme.shifted(by: Long) = if (by == 0L) this else copy(start = start + by, stop = stop + by)

    fun has(name: String): Boolean = find(name) != null

    fun nowNext(name: String, t: Long): NowNext? {
        val f = find(name) ?: return null
        val at = t - f.shift
        var lo = 0
        var hi = f.list.size - 1
        var hit = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            val p = f.list[mid]
            when {
                p.stop <= at -> lo = mid + 1
                p.start > at -> hi = mid - 1
                else -> { hit = mid; break }
            }
        }
        val now = if (hit >= 0) f.list[hit].shifted(f.shift) else null
        val nextIdx = if (hit >= 0) hit + 1 else lo
        val next = f.list.getOrNull(nextIdx)?.shifted(f.shift)
        return if (now == null && next == null) null else NowNext(now, next)
    }

    fun range(name: String, from: Long, to: Long): List<Programme>? {
        val f = find(name) ?: return null
        return f.list.asSequence()
            .map { it.shifted(f.shift) }
            .filter { it.stop > from && it.start < to }
            .toList()
    }

    fun write(out: DataOutputStream) {
        out.writeInt(FORMAT)
        out.writeLong(updated)
        out.writeInt(chan.size)
        for ((key, list) in chan) {
            out.writeUTF(key)
            out.writeInt(list.size)
            for (p in list) {
                out.writeLong(p.start)
                out.writeLong(p.stop)
                out.writeUTF(p.title.take(500))
                out.writeUTF(p.desc.take(2000))
            }
        }
        out.writeInt(alias.size)
        for ((k, v) in alias) {
            out.writeUTF(k)
            out.writeUTF(v)
        }
    }

    companion object {
        private const val FORMAT = 1

        fun read(input: DataInputStream): EpgIndex {
            if (input.readInt() != FORMAT) throw IOException("old format")
            val updated = input.readLong()
            val n = input.readInt()
            val chan = HashMap<String, List<Programme>>(n * 2)
            repeat(n) {
                val key = input.readUTF()
                val size = input.readInt()
                val list = ArrayList<Programme>(size)
                repeat(size) {
                    list.add(Programme(input.readLong(), input.readLong(), input.readUTF(), input.readUTF()))
                }
                chan[key] = list
            }
            val a = input.readInt()
            val alias = HashMap<String, String>(a * 2)
            repeat(a) { alias[input.readUTF()] = input.readUTF() }
            return EpgIndex(updated, chan, alias)
        }
    }
}

/** Потоковый разбор XMLTV: только каналы из плейлиста и передачи около текущего момента. */
class XmltvCollector(names: Collection<String>, private val now: Long = System.currentTimeMillis()) {

    companion object {
        const val KEEP_BEFORE = 14 * 3_600_000L
        const val KEEP_AFTER = 26 * 3_600_000L
        const val DESC_MAX = 300

        private val entity = Regex("&(#x[0-9a-fA-F]+|#\\d+|[a-zA-Z]+);")
        private val cdata = Regex("<!\\[CDATA\\[([\\s\\S]*?)]]>")
        private val ws = Regex("\\s+")
        private val displayName = Regex("<display-name(\\s[^>]*)?>([\\s\\S]*?)</display-name>")
        private val timeRe = Regex("^(\\d{4})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})?\\s*([+-]\\d{2}):?(\\d{2})?")

        fun decode(s: String): String {
            val noCdata = cdata.replace(s) { it.groupValues[1] }
            return entity.replace(noCdata) { m ->
                val e = m.groupValues[1]
                if (e.startsWith("#")) {
                    val code = if (e.length > 1 && (e[1] == 'x' || e[1] == 'X')) e.substring(2).toIntOrNull(16) else e.substring(1).toIntOrNull()
                    if (code == null) m.value else String(Character.toChars(code))
                } else {
                    when (e) {
                        "amp" -> "&"; "lt" -> "<"; "gt" -> ">"; "quot" -> "\""; "apos" -> "'"; "nbsp" -> " "
                        else -> m.value
                    }
                }
            }
        }

        fun parseTime(s: String?): Long? {
            val m = timeRe.find(s?.trim() ?: return null) ?: return null
            val g = m.groupValues
            val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
            cal.clear()
            cal.set(g[1].toInt(), g[2].toInt() - 1, g[3].toInt(), g[4].toInt(), g[5].toInt(), g[6].ifEmpty { "0" }.toInt())
            var t = cal.timeInMillis
            if (g[7].isNotEmpty()) {
                val sign = if (g[7][0] == '-') -1 else 1
                val off = (Math.abs(g[7].toInt()) * 60 + (g[8].ifEmpty { "0" }).toInt()) * 60_000L
                t -= sign * off
            }
            return t
        }

        private fun attr(tag: String, name: String): String? {
            val m = Regex("\\s$name\\s*=\\s*(\"([^\"]*)\"|'([^']*)')").find(tag) ?: return null
            return decode(m.groups[2]?.value ?: m.groups[3]?.value ?: "")
        }

        private fun firstText(block: String, tag: String): String {
            val m = Regex("<$tag(\\s[^>]*)?>([\\s\\S]*?)</$tag>").find(block) ?: return ""
            return ws.replace(decode(m.groupValues[2]), " ").trim()
        }
    }

    private val wanted = HashSet<String>()
    private val idToKeys = HashMap<String, MutableList<String>>()
    private val taken = HashSet<String>()
    private val chan = HashMap<String, MutableList<Programme>>()
    private val buf = StringBuilder()

    init {
        for (n in names) wanted.addAll(EpgNames.keys(n))
    }

    fun feed(text: CharSequence) {
        buf.append(text)
        var pos = 0
        while (true) {
            val open = buf.indexOf("<", pos)
            if (open < 0) { pos = buf.length; break }
            val isProg = buf.startsWith("<programme", open)
            val isChan = !isProg && buf.startsWith("<channel", open)
            if (!isProg && !isChan) {
                if (open + 10 > buf.length) { pos = open; break }
                pos = open + 1
                continue
            }
            val headEnd = buf.indexOf(">", open)
            if (headEnd < 0) { pos = open; break }
            val end: Int
            if (buf[headEnd - 1] == '/') {
                end = headEnd + 1
            } else {
                val closeTag = if (isProg) "</programme>" else "</channel>"
                val c = buf.indexOf(closeTag, headEnd)
                if (c < 0) { pos = open; break }
                end = c + closeTag.length
            }
            val head = buf.substring(open, headEnd + 1)
            val block = buf.substring(open, end)
            if (isProg) programme(head, block) else channel(head, block)
            pos = end
        }
        buf.delete(0, pos)
        if (buf.length > 4 * 1024 * 1024) buf.setLength(0)
    }

    private fun StringBuilder.startsWith(prefix: String, at: Int): Boolean {
        if (at + prefix.length > length) return false
        for (i in prefix.indices) if (this[at + i] != prefix[i]) return false
        return true
    }

    private fun channel(head: String, block: String) {
        val id = attr(head, "id") ?: return
        val cands = displayName.findAll(block).map { decode(it.groupValues[2]).trim() }.filter { it.isNotEmpty() }.toMutableList()
        cands.add(id)
        for (c in cands) {
            if (EpgNames.norm(c).shift != 0) continue // сдвинутые копии считаем сами от основного канала
            for (key in EpgNames.keys(c)) {
                if (key !in wanted || key in taken) continue
                taken.add(key)
                idToKeys.getOrPut(id) { mutableListOf() }.add(key)
            }
        }
    }

    private fun programme(head: String, block: String) {
        val id = attr(head, "channel") ?: return
        val keys = idToKeys[id] ?: return
        val start = parseTime(attr(head, "start")) ?: return
        val stop = parseTime(attr(head, "stop")) ?: (start + 3_600_000L)
        if (stop < now - KEEP_BEFORE || start > now + KEEP_AFTER) return
        val title = firstText(block, "title").trimStart('>', ' ')
        if (title.isEmpty()) return
        var desc = firstText(block, "desc")
        if (desc.length > DESC_MAX) desc = desc.substring(0, DESC_MAX - 1).replace(Regex("\\s+\\S*$"), "") + "…"
        chan.getOrPut(keys[0]) { mutableListOf() }.add(Programme(start, stop, title, desc))
    }

    fun finish(): EpgIndex {
        val out = HashMap<String, List<Programme>>()
        val alias = HashMap<String, String>()
        for ((_, keys) in idToKeys) {
            val list = chan[keys[0]] ?: continue
            if (list.isEmpty()) continue
            list.sortBy { it.start }
            val clean = ArrayList<Programme>(list.size)
            for (p in list) {
                val last = clean.lastOrNull()
                if (last != null && p.start == last.start) continue
                if (last != null && last.stop > p.start) clean[clean.size - 1] = last.copy(stop = p.start)
                clean.add(p)
            }
            out[keys[0]] = clean
            for (k in keys.drop(1)) alias[k] = keys[0]
        }
        return EpgIndex(System.currentTimeMillis(), out, alias)
    }
}

/** Загрузка программы и кэш в файле приложения. */
object Epg {
    val SOURCES = listOf(
        "http://epg.it999.ru/edem.xml.gz",
        "https://iptvx.one/EPG",
        "http://epg.one/epg2.xml.gz"
    )
    private const val MAX_AGE = 12 * 3_600_000L
    private const val RETRY_MS = 10 * 60_000L
    private const val FILE = "epg.bin"

    @Volatile var index: EpgIndex? = null
        private set
    @Volatile var loading = false
        private set
    private var sig: String? = null
    private var lastError = 0L

    /** Скачивает и разбирает программу (блокирующий вызов, вызывать в фоне). */
    fun download(url: String, names: Collection<String>, now: Long = System.currentTimeMillis()): EpgIndex {
        var current = url
        var hops = 0
        while (true) {
            val conn = URL(current).openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 20_000
                conn.readTimeout = 60_000
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("User-Agent", PlaylistLoader.USER_AGENT)
                conn.setRequestProperty("Accept-Encoding", "gzip")
                val code = conn.responseCode
                if (code in 300..399) {
                    val location = conn.getHeaderField("Location") ?: throw IOException("Redirect without location")
                    current = URL(URL(current), location).toString()
                    if (++hops > 6) throw IOException("Too many redirects")
                    continue
                }
                if (code !in 200..299) throw IOException("HTTP $code")
                val index = parse(conn.inputStream, names, now)
                if (index.channelCount == 0) throw IOException("No matching channels")
                return index
            } finally {
                conn.disconnect()
            }
        }
    }

    /** Разбор потока: gzip узнаём по первым байтам. */
    fun parse(raw: InputStream, names: Collection<String>, now: Long = System.currentTimeMillis()): EpgIndex {
        val buffered = BufferedInputStream(raw, 64 * 1024)
        buffered.mark(2)
        val b0 = buffered.read()
        val b1 = buffered.read()
        buffered.reset()
        val stream: InputStream = if (b0 == 0x1f && b1 == 0x8b) GZIPInputStream(buffered, 64 * 1024) else buffered
        val collector = XmltvCollector(names, now)
        InputStreamReader(stream, Charsets.UTF_8).use { reader ->
            val chars = CharArray(64 * 1024)
            while (true) {
                val n = reader.read(chars)
                if (n < 0) break
                collector.feed(java.nio.CharBuffer.wrap(chars, 0, n))
            }
        }
        return collector.finish()
    }

    private fun cacheFile(context: Context) = File(context.filesDir, FILE)

    private fun readCache(context: Context, signature: String): EpgIndex? = try {
        DataInputStream(BufferedInputStream(cacheFile(context).inputStream())).use { input ->
            if (input.readUTF() != signature) null else EpgIndex.read(input)
        }
    } catch (e: Exception) {
        null
    }

    private fun writeCache(context: Context, signature: String, index: EpgIndex) {
        try {
            val tmp = File(context.filesDir, "$FILE.tmp")
            DataOutputStream(tmp.outputStream().buffered()).use { out ->
                out.writeUTF(signature)
                index.write(out)
            }
            tmp.renameTo(cacheFile(context))
        } catch (e: Exception) {
            // без кэша просто скачаем в следующий раз
        }
    }

    /**
     * Готовит программу под каналы плейлиста: из кэша, а если он старше 12 часов - скачивает заново.
     * onChange вызывается в главном потоке, когда появилась новая программа.
     */
    fun start(context: Context, scope: CoroutineScope, names: List<String>, onChange: () -> Unit) {
        val app = context.applicationContext
        val signature = EpgNames.signature(names)
        if (signature != sig) {
            sig = signature
            index = null
            lastError = 0L
        }
        scope.launch {
            if (index == null) {
                val cached = withContext(Dispatchers.IO) { readCache(app, signature) }
                if (cached != null && sig == signature) {
                    index = cached
                    onChange()
                }
            }
            val fresh = index?.let { System.currentTimeMillis() - it.updated < MAX_AGE } == true
            if (fresh || loading) return@launch
            if (lastError != 0L && System.currentTimeMillis() - lastError < RETRY_MS) return@launch
            loading = true
            val loaded = withContext(Dispatchers.IO) {
                var result: EpgIndex? = null
                for (url in SOURCES) {
                    val t0 = System.currentTimeMillis()
                    result = try {
                        download(url, names)
                    } catch (e: Exception) {
                        android.util.Log.w("EFIR-EPG", "$url: $e")
                        null
                    }
                    if (result != null) {
                        android.util.Log.i("EFIR-EPG", "loaded ${result.channelCount} channels from $url in ${System.currentTimeMillis() - t0} ms")
                        break
                    }
                }
                result?.let { writeCache(app, signature, it) }
                result
            }
            loading = false
            if (sig != signature) return@launch
            if (loaded == null) {
                lastError = System.currentTimeMillis()
                return@launch
            }
            lastError = 0L
            index = loaded
            onChange()
        }
    }
}
