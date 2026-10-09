package uz.efir.tv

/**
 * Разбор M3U: #EXTINF с атрибутами tvg-name, tvg-logo, tvg-chno, group-title,
 * #EXTGRP, #EXTVLCOPT (user-agent, referrer) и заголовки после «|» в ссылке.
 */
object M3uParser {

    private val attrRegex = Regex("""([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"""")

    private class Entry {
        var title: String = ""
        var tvgName: String? = null
        var logo: String? = null
        var group: String? = null
        var chno: Int? = null
        var userAgent: String? = null
        var referrer: String? = null
    }

    private class Raw(val entry: Entry, val url: String)

    fun parse(text: String): List<Channel> {
        val raws = ArrayList<Raw>()
        var current: Entry? = null

        for (rawLine in text.lineSequence()) {
            val line = rawLine.trim().removePrefix("﻿")
            if (line.isEmpty()) continue
            when {
                line.startsWith("#EXTINF", ignoreCase = true) -> {
                    current = parseExtInf(line)
                }
                line.startsWith("#EXTGRP:", ignoreCase = true) -> {
                    val e = current ?: Entry().also { current = it }
                    if (e.group.isNullOrBlank()) e.group = line.substringAfter(':').trim()
                }
                line.startsWith("#EXTVLCOPT:", ignoreCase = true) -> {
                    val e = current ?: Entry().also { current = it }
                    val opt = line.substringAfter(':').trim()
                    val key = opt.substringBefore('=').trim().lowercase()
                    val value = opt.substringAfter('=', "").trim()
                    when (key) {
                        "http-user-agent" -> e.userAgent = value
                        "http-referrer", "http-referer" -> e.referrer = value
                    }
                }
                line.startsWith("#") -> Unit
                else -> {
                    val e = current ?: Entry()
                    var url = line
                    val pipe = line.indexOf('|')
                    if (pipe > 0) {
                        url = line.substring(0, pipe).trim()
                        parsePipeHeaders(line.substring(pipe + 1), e)
                    }
                    if (url.contains("://") || url.startsWith("/")) {
                        raws.add(Raw(e, url))
                    }
                    current = null
                }
            }
        }
        return number(raws)
    }

    private fun parseExtInf(line: String): Entry {
        val e = Entry()
        val comma = titleComma(line)
        val attrs = if (comma >= 0) line.substring(0, comma) else line
        e.title = if (comma >= 0) line.substring(comma + 1).trim() else ""
        for (m in attrRegex.findAll(attrs)) {
            val key = m.groupValues[1].lowercase()
            val value = m.groupValues[2].trim()
            if (value.isEmpty()) continue
            when (key) {
                "tvg-name" -> e.tvgName = value
                "tvg-logo", "logo" -> e.logo = value
                "group-title" -> e.group = value
                "tvg-chno", "channel-number" -> e.chno = value.toIntOrNull()
                "user-agent", "http-user-agent" -> e.userAgent = value
                "referer", "referrer", "http-referrer" -> e.referrer = value
            }
        }
        return e
    }

    /** Первая запятая вне кавычек отделяет атрибуты от названия. */
    private fun titleComma(line: String): Int {
        var inQuotes = false
        for (i in line.indices) {
            val c = line[i]
            if (c == '"') {
                inQuotes = !inQuotes
            } else if (c == ',' && !inQuotes) {
                return i
            }
        }
        return -1
    }

    private fun parsePipeHeaders(headers: String, e: Entry) {
        for (pair in headers.split('&')) {
            val key = pair.substringBefore('=').trim().lowercase()
            val value = pair.substringAfter('=', "").trim()
            if (value.isEmpty()) continue
            when (key) {
                "user-agent" -> e.userAgent = value
                "referer", "referrer" -> e.referrer = value
            }
        }
    }

    /**
     * Номера: если у всех каналов есть уникальный tvg-chno - берём его,
     * иначе нумеруем по порядку с 1.
     */
    private fun number(raws: List<Raw>): List<Channel> {
        val chnos = raws.map { it.entry.chno }
        val useChno = raws.isNotEmpty() &&
            chnos.all { it != null && it > 0 } &&
            chnos.toSet().size == chnos.size

        return raws.mapIndexed { index, raw ->
            val e = raw.entry
            val number = if (useChno) e.chno!! else index + 1
            val name = when {
                e.title.isNotBlank() -> e.title
                !e.tvgName.isNullOrBlank() -> e.tvgName!!
                else -> "Канал $number"
            }
            Channel(
                number = number,
                name = name,
                url = raw.url,
                logo = e.logo,
                group = e.group?.takeIf { it.isNotBlank() },
                userAgent = e.userAgent,
                referrer = e.referrer
            )
        }
    }
}
