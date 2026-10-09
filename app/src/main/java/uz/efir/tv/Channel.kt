package uz.efir.tv

/** Один канал из плейлиста. */
data class Channel(
    val number: Int,
    val name: String,
    val url: String,
    val logo: String?,
    val group: String?,
    val userAgent: String?,
    val referrer: String?
) {
    /** Ключ для избранного и последнего канала: имя стабильнее ссылки (в ссылках часто меняются токены). */
    val key: String get() = name

    val initials: String get() = makeInitials(name)

    companion object {
        fun makeInitials(name: String): String {
            val words = name
                .split(' ', '-', '_', '.', '|', '/', '(', ')', '[', ']')
                .map { word -> word.filter { it.isLetterOrDigit() } }
                .filter { it.isNotEmpty() }
            if (words.isEmpty()) return "TV"
            val result = if (words.size == 1) {
                words[0].take(2)
            } else {
                "${words[0][0]}${words[1][0]}"
            }
            return result.uppercase()
        }
    }
}

/** Строка в списке: канал или действие из вкладки «Настройки». */
sealed class Row {
    data class Ch(val channel: Channel) : Row()
    data class Action(val id: Int, val title: String) : Row()
}
