package uz.efir.tv

/** Код файла на transfiles.ru - символы после «transfiles.ru/». */
object TransfilesCode {

    private val linkRegex = Regex(
        """^(?:https?://)?(?:www\.)?transfiles\.ru/([A-Za-z0-9]+)/?(?:[?#].*)?$""",
        RegexOption.IGNORE_CASE
    )
    private val codeRegex = Regex("""^[A-Za-z0-9]{3,12}$""")

    /** Код из полной ссылки transfiles.ru/xxxxx, иначе null. */
    fun codeFromLink(input: String): String? =
        linkRegex.matchEntire(input.trim())?.groupValues?.get(1)

    /** Код из поля «код»: «abc12», «transfiles.ru/abc12» или полная ссылка. */
    fun codeFrom(input: String): String? {
        val s = input.trim().replace(" ", "")
        codeFromLink(s)?.let { return it }
        return if (codeRegex.matches(s)) s else null
    }
}
