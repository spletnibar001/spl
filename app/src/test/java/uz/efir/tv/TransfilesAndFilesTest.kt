package uz.efir.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class TransfilesAndFilesTest {

    @Test
    fun readsCodeFromInput() {
        assertEquals("abc12", TransfilesCode.codeFrom("abc12"))
        assertEquals("abc12", TransfilesCode.codeFrom(" abc12 "))
        assertEquals("abc12", TransfilesCode.codeFrom("transfiles.ru/abc12"))
        assertEquals("abc12", TransfilesCode.codeFrom("https://transfiles.ru/abc12"))
        assertEquals("abc12", TransfilesCode.codeFrom("https://TransFiles.ru/abc12/"))
        assertNull(TransfilesCode.codeFrom("ab"))
        assertNull(TransfilesCode.codeFrom("abc-12"))
    }

    @Test
    fun recognisesOnlyTransfilesLinks() {
        assertEquals("abc12", TransfilesCode.codeFromLink("http://www.transfiles.ru/abc12"))
        assertNull(TransfilesCode.codeFromLink("abc12"))
        assertNull(TransfilesCode.codeFromLink("http://example.com/abc12"))
    }

    @Test
    fun extractsPlaylistFromZip() {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            zip.putNextEntry(ZipEntry("readme.txt"))
            zip.write("hello".toByteArray())
            zip.closeEntry()
            zip.putNextEntry(ZipEntry("tv/list.m3u"))
            zip.write("#EXTM3U\n#EXTINF:-1,Канал\nhttp://a.example/1\n".toByteArray())
            zip.closeEntry()
        }
        val text = PlaylistLoader.extractPlaylist(out.toByteArray())
        assertTrue(text.contains("#EXTINF"))
        assertEquals(1, M3uParser.parse(text).size)
    }

    @Test
    fun decodesWindows1251() {
        val bytes = "#EXTM3U\n#EXTINF:-1,Первый канал\nhttp://a.example/1\n".toByteArray(charset("windows-1251"))
        val list = M3uParser.parse(PlaylistLoader.extractPlaylist(bytes))
        assertEquals("Первый канал", list[0].name)
    }
}
