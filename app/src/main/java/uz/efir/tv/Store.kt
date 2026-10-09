package uz.efir.tv

import android.content.Context
import java.io.File

/** Настройки, избранное и сохранённая копия плейлиста. */
class Store(context: Context) {

    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("efir", Context.MODE_PRIVATE)
    private val cacheFile = File(app.filesDir, "playlist.m3u")
    private val favorites: MutableSet<String> =
        HashSet(prefs.getStringSet(KEY_FAV, emptySet()) ?: emptySet())
    private val hiddenChannels: MutableSet<String> =
        HashSet(prefs.getStringSet(KEY_HIDDEN, emptySet()) ?: emptySet())
    private val hiddenGroups: MutableSet<String> =
        HashSet(prefs.getStringSet(KEY_HIDDEN_GROUPS, emptySet()) ?: emptySet())

    var playlistUrl: String?
        get() = prefs.getString(KEY_URL, null)
        set(value) {
            prefs.edit().putString(KEY_URL, value).apply()
        }

    var lastChannel: String?
        get() = prefs.getString(KEY_LAST, null)
        set(value) {
            prefs.edit().putString(KEY_LAST, value).apply()
        }

    var lastTab: String?
        get() = prefs.getString(KEY_TAB, null)
        set(value) {
            prefs.edit().putString(KEY_TAB, value).apply()
        }

    val isLocalPlaylist: Boolean
        get() = playlistUrl == LOCAL

    fun isFavorite(channel: Channel): Boolean = favorites.contains(channel.key)

    fun hasFavorites(): Boolean = favorites.isNotEmpty()

    /** Возвращает true, если канал добавлен, false - если убран. */
    fun toggleFavorite(channel: Channel): Boolean {
        val added = if (favorites.contains(channel.key)) {
            favorites.remove(channel.key)
            false
        } else {
            favorites.add(channel.key)
            true
        }
        prefs.edit().putStringSet(KEY_FAV, HashSet(favorites)).apply()
        return added
    }

    // ---------- Скрытые каналы и группы ----------

    fun isHidden(channel: Channel): Boolean {
        if (hiddenChannels.contains(channel.key)) return true
        val group = channel.group ?: return false
        return hiddenGroups.contains(group)
    }

    fun hiddenCount(): Int = hiddenChannels.size + hiddenGroups.size

    /** Скрытые каналы и группы по алфавиту: группы первыми. */
    fun hiddenGroupList(): List<String> = hiddenGroups.sortedBy { it.lowercase() }

    fun hiddenChannelList(): List<String> = hiddenChannels.sortedBy { it.lowercase() }

    fun hideChannel(channel: Channel) {
        hiddenChannels.add(channel.key)
        prefs.edit().putStringSet(KEY_HIDDEN, HashSet(hiddenChannels)).apply()
    }

    fun hideGroup(group: String) {
        hiddenGroups.add(group)
        prefs.edit().putStringSet(KEY_HIDDEN_GROUPS, HashSet(hiddenGroups)).apply()
    }

    fun unhideChannel(key: String) {
        hiddenChannels.remove(key)
        prefs.edit().putStringSet(KEY_HIDDEN, HashSet(hiddenChannels)).apply()
    }

    fun unhideGroup(group: String) {
        hiddenGroups.remove(group)
        prefs.edit().putStringSet(KEY_HIDDEN_GROUPS, HashSet(hiddenGroups)).apply()
    }

    fun unhideAll() {
        hiddenChannels.clear()
        hiddenGroups.clear()
        prefs.edit()
            .putStringSet(KEY_HIDDEN, HashSet<String>())
            .putStringSet(KEY_HIDDEN_GROUPS, HashSet<String>())
            .apply()
    }

    // ---------- Сохранённая копия плейлиста ----------

    fun saveCache(text: String) {
        val tmp = File(cacheFile.parentFile, "playlist.tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(cacheFile)) {
            cacheFile.writeText(text)
            tmp.delete()
        }
    }

    fun loadCache(): String? = try {
        if (cacheFile.exists()) cacheFile.readText() else null
    } catch (e: Exception) {
        null
    }

    companion object {
        const val LOCAL = "local:phone"
        private const val KEY_URL = "url"
        private const val KEY_LAST = "last"
        private const val KEY_TAB = "tab"
        private const val KEY_FAV = "fav"
        private const val KEY_HIDDEN = "hidden"
        private const val KEY_HIDDEN_GROUPS = "hidden_groups"
    }
}
