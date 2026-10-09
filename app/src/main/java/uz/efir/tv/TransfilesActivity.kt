package uz.efir.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import uz.efir.tv.databinding.ActivityTransfilesBinding

/**
 * Скачивание плейлиста с transfiles.ru по короткому коду.
 * Сайт просит капчу, поэтому страница открывается внутри приложения:
 * человек вводит символы с картинки, а приложение перехватывает скачивание.
 */
class TransfilesActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_CODE = "uz.efir.tv.TRANSFILES_CODE"
        private const val BASE = "https://transfiles.ru/"

        /** Скроллит к капче и ставит фокус в поле ввода; если на странице уже текст плейлиста - отдаёт его. */
        private const val INSPECT_JS = """
(function () {
  var body = document.body ? (document.body.innerText || '') : '';
  if (body.indexOf('#EXTINF') >= 0) return body;
  var img = document.querySelector('img[src*="securimage"]');
  if (img) {
    try { img.scrollIntoView({block: 'center'}); } catch (e) { img.scrollIntoView(); }
    var form = img.closest ? img.closest('form') : null;
    var input = form ? form.querySelector('input[type=text], input:not([type])') : null;
    if (!input) input = document.querySelector('input[name*=captcha], input[id*=captcha], input[name*=code], input[type=text]');
    if (input) input.focus();
  }
  return '';
})()
"""
    }

    private lateinit var b: ActivityTransfilesBinding
    private lateinit var store: Store
    private var web: WebView? = null
    private var code = ""
    private var busy = false
    private var done = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityTransfilesBinding.inflate(layoutInflater)
        setContentView(b.root)
        store = Store(this)

        code = intent.getStringExtra(EXTRA_CODE).orEmpty()
        if (code.isEmpty()) {
            finish()
            return
        }
        b.tfTitle.text = getString(R.string.tf_title, code)

        val view = try {
            WebView(this)
        } catch (e: Exception) {
            null
        }
        if (view == null) {
            b.tfLoading.visibility = View.GONE
            showStatus(getString(R.string.tf_no_webview), true)
            return
        }
        web = view
        b.webContainer.addView(
            view,
            0,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setupWeb(view)
        view.loadUrl(BASE + code)
        view.requestFocus()
    }

    override fun onDestroy() {
        web?.let {
            it.stopLoading()
            (it.parent as? ViewGroup)?.removeView(it)
            it.destroy()
        }
        web = null
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWeb(view: WebView) {
        val settings = view.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.javaScriptCanOpenWindowsAutomatically = true
        settings.setSupportMultipleWindows(false)
        settings.textZoom = 115
        CookieManager.getInstance().setAcceptCookie(true)
        view.isFocusable = true
        view.isFocusableInTouchMode = true

        view.webViewClient = object : WebViewClient() {
            override fun onPageStarted(v: WebView, url: String, favicon: Bitmap?) {
                b.tfLoading.visibility = View.VISIBLE
            }

            override fun onPageFinished(v: WebView, url: String) {
                b.tfLoading.visibility = View.GONE
                inspectPage(v)
            }

            @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
            override fun onReceivedError(v: WebView, errorCode: Int, description: String?, failingUrl: String?) {
                b.tfLoading.visibility = View.GONE
                showStatus(getString(R.string.tf_error_page), true)
            }
        }
        view.setDownloadListener { url, userAgent, _, _, _ -> download(url, userAgent) }
    }

    private fun inspectPage(view: WebView) {
        if (done) return
        view.evaluateJavascript(INSPECT_JS) { result ->
            val text = decodeJsString(result)
            if (text.contains("#EXTINF")) accept(text)
        }
    }

    private fun decodeJsString(value: String?): String {
        if (value == null || value == "null") return ""
        return try {
            JSONArray("[$value]").optString(0, "")
        } catch (e: Exception) {
            ""
        }
    }

    private fun download(url: String, userAgent: String?) {
        if (busy || done) return
        busy = true
        showStatus(getString(R.string.tf_downloading), false)
        val headers = HashMap<String, String>()
        CookieManager.getInstance().getCookie(url)?.let { headers["Cookie"] = it }
        headers["Referer"] = BASE + code
        lifecycleScope.launch {
            try {
                val bytes = PlaylistLoader.fetchBytes(url, userAgent ?: PlaylistLoader.USER_AGENT, headers)
                val text = withContext(Dispatchers.Default) { PlaylistLoader.extractPlaylist(bytes) }
                busy = false
                accept(text)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                busy = false
                showStatus(getString(R.string.tf_error_download), true)
            }
        }
    }

    private fun accept(text: String) {
        if (busy || done) return
        busy = true
        showStatus(getString(R.string.tf_checking), false)
        lifecycleScope.launch {
            val count = withContext(Dispatchers.Default) { M3uParser.parse(text).size }
            if (count == 0) {
                busy = false
                showStatus(getString(R.string.setup_error_parse), true)
                return@launch
            }
            withContext(Dispatchers.IO) { store.saveCache(text) }
            store.playlistUrl = Store.LOCAL
            done = true
            val intent = Intent(this@TransfilesActivity, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                .putExtra(MainActivity.EXTRA_RELOAD, true)
            startActivity(intent)
            finish()
        }
    }

    private fun showStatus(text: String, error: Boolean) {
        b.tfStatus.text = text
        b.tfStatus.setTextColor(ContextCompat.getColor(this, if (error) R.color.accent else R.color.light))
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                val view = web
                if (view != null && view.canGoBack()) view.goBack() else finish()
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }
}
