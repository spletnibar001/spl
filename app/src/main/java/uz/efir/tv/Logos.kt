package uz.efir.tv

import android.view.View
import android.widget.ImageView
import android.widget.TextView
import coil.dispose
import coil.load

/** Логотип канала поверх инициалов: если логотипа нет или он не загрузился, видны инициалы. */
object Logos {
    fun show(image: ImageView, initials: TextView, url: String?) {
        image.dispose()
        image.setImageDrawable(null)
        initials.visibility = View.VISIBLE
        if (url.isNullOrBlank()) return
        image.load(url) {
            crossfade(false)
            size(192)
            listener(
                onSuccess = { _, _ -> initials.visibility = View.INVISIBLE },
                onError = { _, _ -> initials.visibility = View.VISIBLE }
            )
        }
    }
}
