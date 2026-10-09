package uz.efir.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class M3uParserTest {

    @Test
    fun parsesAttributesAndTitle() {
        val text = """
            #EXTM3U url-tvg="http://epg.example/epg.xml"
            #EXTINF:-1 tvg-name="UZ24" tvg-logo="http://logo.example/uz.png" group-title="Новости, регион",Uzbekistan 24
            http://stream.example/uz24/index.m3u8
            #EXTINF:-1 group-title="Кино",Кино ТВ
            http://stream.example/kino.ts
        """.trimIndent()
        val list = M3uParser.parse(text)
        assertEquals(2, list.size)
        assertEquals("Uzbekistan 24", list[0].name)
        assertEquals("Новости, регион", list[0].group)
        assertEquals("http://logo.example/uz.png", list[0].logo)
        assertEquals("http://stream.example/uz24/index.m3u8", list[0].url)
        assertEquals(1, list[0].number)
        assertEquals(2, list[1].number)
        assertNull(list[1].logo)
    }

    @Test
    fun usesUniqueChannelNumbers() {
        val text = """
            #EXTM3U
            #EXTINF:-1 tvg-chno="5",Five
            http://a.example/5
            #EXTINF:-1 tvg-chno="12",Twelve
            http://a.example/12
        """.trimIndent()
        val list = M3uParser.parse(text)
        assertEquals(listOf(5, 12), list.map { it.number })
    }

    @Test
    fun fallsBackToSequentialNumbersOnDuplicates() {
        val text = """
            #EXTINF:-1 tvg-chno="3",A
            http://a.example/a
            #EXTINF:-1 tvg-chno="3",B
            http://a.example/b
        """.trimIndent()
        assertEquals(listOf(1, 2), M3uParser.parse(text).map { it.number })
    }

    @Test
    fun readsHeadersFromVlcOptAndPipe() {
        val text = """
            #EXTM3U
            #EXTINF:-1,One
            #EXTVLCOPT:http-user-agent=MyAgent/1.0
            #EXTVLCOPT:http-referrer=http://ref.example/
            http://a.example/one
            #EXTINF:-1,Two
            http://a.example/two.m3u8|User-Agent=Other&Referer=http://r2.example/
        """.trimIndent()
        val list = M3uParser.parse(text)
        assertEquals("MyAgent/1.0", list[0].userAgent)
        assertEquals("http://ref.example/", list[0].referrer)
        assertEquals("http://a.example/two.m3u8", list[1].url)
        assertEquals("Other", list[1].userAgent)
        assertEquals("http://r2.example/", list[1].referrer)
    }

    @Test
    fun readsExtGrpAndPlainLinks() {
        val text = "﻿#EXTM3U\r\n#EXTINF:-1,News\r\n#EXTGRP:Новости\r\nhttp://a.example/news\r\nhttp://a.example/plain\r\n"
        val list = M3uParser.parse(text)
        assertEquals(2, list.size)
        assertEquals("Новости", list[0].group)
        assertEquals("Канал 2", list[1].name)
    }

    @Test
    fun makesInitials() {
        assertEquals("ПК", Channel.makeInitials("Первый канал"))
        assertEquals("Р1", Channel.makeInitials("Россия 1"))
        assertEquals("SE", Channel.makeInitials("Sevimli"))
        assertEquals("TV", Channel.makeInitials("---"))
    }
}
