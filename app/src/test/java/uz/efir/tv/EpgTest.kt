package uz.efir.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.util.Calendar
import java.util.TimeZone
import java.util.zip.GZIPOutputStream

class EpgTest {

    private fun key(n: String) = EpgNames.norm(n).key

    @Test
    fun names() {
        assertEquals("первый канал", key("Первый канал HD"))
        assertEquals("матч премьер", key("Матч! Премьер FHD"))
        assertEquals("матч футбол 1", key("Матч! Футбол 1 HD 50 orig"))
        assertEquals("viju+sport", key("Viju+ Sport HD orig"))
        assertEquals("sky sports action", key("Sky Sports Action HD 50 UK"))
        assertEquals("муз тв", key("МУЗ-ТВ +0 (Элиста)"))
        assertEquals("бобер", key("Бобёр"))
        assertEquals("иллюзион+", key("Иллюзион+"))
        assertEquals("sci fi", key(".sci-fi"))
        assertEquals("тнт", EpgNames.norm("ТНТ +4").key)
        assertEquals(4, EpgNames.norm("ТНТ +4").shift)
        assertEquals(0, EpgNames.norm("РЕН ТВ HD").shift)
        assertEquals("тв 3", key("ТВ-3 HD"))
        assertEquals("360", key("360 HD"))
        assertEquals("тнт4", key("ТНТ4"))
    }

    private fun utc(y: Int, mo: Int, d: Int, h: Int, mi: Int): Long {
        val c = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        c.clear()
        c.set(y, mo - 1, d, h, mi, 0)
        return c.timeInMillis
    }

    @Test
    fun time() {
        assertEquals(utc(2026, 11, 4, 16, 0), XmltvCollector.parseTime("20261104190000 +0300"))
        assertEquals(utc(2026, 11, 4, 19, 0), XmltvCollector.parseTime("20261104190000 +0000"))
        assertEquals(utc(2026, 11, 4, 20, 30), XmltvCollector.parseTime("20261104190000 -0130"))
        assertEquals("Tom & Jerry «x» \"y\"", XmltvCollector.decode("Tom &amp; Jerry &#171;x&#187; &quot;y&quot;"))
    }

    // 18:30 МСК
    private val now = utc(2026, 11, 4, 15, 30)

    private fun t(h: Int, m: Int = 0): String {
        val ms = utc(2026, 11, 4, h - 3, m)
        val c = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        c.timeInMillis = ms
        return String.format(
            "%04d%02d%02d%02d%02d00 +0000",
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH), c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE)
        )
    }

    private val xml by lazy {
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<tv>\n" +
            "<channel id=\"1\"><display-name lang=\"ru\">Первый канал</display-name><icon src=\"x\"/></channel>\n" +
            "<channel id=\"ntv\"><display-name>НТВ</display-name></channel>\n" +
            "<channel id=\"tnt\"><display-name>ТНТ</display-name></channel>\n" +
            "<channel id=\"tnt4\"><display-name>ТНТ +4</display-name></channel>\n" +
            "<channel id=\"match\"><display-name>Матч Премьер</display-name></channel>\n" +
            "<channel id=\"other\"><display-name>Неизвестный</display-name></channel>\n" +
            "<programme start=\"${t(17)}\" stop=\"${t(18)}\" channel=\"1\"><title>Новости</title></programme>\n" +
            "<programme start=\"${t(18)}\" stop=\"${t(19, 45)}\" channel=\"1\"><title>Время покажет</title><desc>Ток-шоу &amp; споры</desc></programme>\n" +
            "<programme start=\"${t(19, 45)}\" stop=\"${t(20, 50)}\" channel=\"1\"><title>Поле чудес</title></programme>\n" +
            "<programme start=\"${t(18)}\" stop=\"${t(19)}\" channel=\"tnt\"><title>Универ</title></programme>\n" +
            "<programme start=\"${t(14)}\" stop=\"${t(15)}\" channel=\"tnt\"><title>Дневное</title></programme>\n" +
            "<programme start=\"${t(14)}\" stop=\"${t(15)}\" channel=\"tnt4\"><title>Сдвинутое</title></programme>\n" +
            "<programme start=\"${t(18, 15)}\" stop=\"${t(20)}\" channel=\"match\"><title><![CDATA[Футбол. РПЛ]]></title></programme>\n" +
            "<programme start=\"${t(18)}\" stop=\"${t(19)}\" channel=\"other\"><title>Чужое</title></programme>\n" +
            "</tv>\n"
    }

    private val names = listOf("Первый канал HD", "НТВ HD", "ТНТ FHD", "ТНТ +4", "Матч! Премьер FHD", "СТС")

    private fun check(index: EpgIndex) {
        val a = index.nowNext("Первый канал HD", now)!!
        assertEquals("Время покажет", a.now!!.title)
        assertEquals("Ток-шоу & споры", a.now!!.desc)
        assertEquals("Поле чудес", a.next!!.title)
        assertEquals("Футбол. РПЛ", index.nowNext("Матч! Премьер FHD", now)!!.now!!.title)
        assertNull(index.nowNext("НТВ HD", now))
        assertNull(index.nowNext("СТС", now))
        val shifted = index.nowNext("ТНТ +4", now)!!.now!!
        assertEquals("Дневное", shifted.title)
        assertEquals(utc(2026, 11, 4, 15, 0), shifted.start)
        assertFalse(index.has("Неизвестный"))
        val day = index.range("Первый канал", utc(2026, 11, 3, 21, 0), utc(2026, 11, 4, 21, 0))!!
        assertEquals(listOf("Новости", "Время покажет", "Поле чудес"), day.map { it.title })
    }

    @Test
    fun parseInPieces() {
        for (step in listOf(1, 7, 64, 100_000)) {
            val c = XmltvCollector(names, now)
            var i = 0
            while (i < xml.length) {
                c.feed(xml.substring(i, minOf(xml.length, i + step)))
                i += step
            }
            check(c.finish())
        }
    }

    @Test
    fun gzipAndCacheRoundTrip() {
        val gz = ByteArrayOutputStream()
        GZIPOutputStream(gz).use { it.write(xml.toByteArray(Charsets.UTF_8)) }
        val index = Epg.parse(ByteArrayInputStream(gz.toByteArray()), names, now)
        check(index)
        val plain = Epg.parse(ByteArrayInputStream(xml.toByteArray(Charsets.UTF_8)), names, now)
        check(plain)

        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { index.write(it) }
        val back = EpgIndex.read(DataInputStream(ByteArrayInputStream(bytes.toByteArray())))
        check(back)
        assertTrue(back.updated > 0)
        assertNotNull(back.nowNext("Первый канал", now))
    }
}
