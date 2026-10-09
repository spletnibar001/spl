package uz.efir.tv

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uz.efir.tv.databinding.ActivitySetupBinding

/** Первый запуск и смена плейлиста: QR для телефона или ввод ссылки пультом. */
class SetupActivity : AppCompatActivity() {

    private lateinit var b: ActivitySetupBinding
    private lateinit var store: Store
    private var server: LocalServer? = null
    private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(b.root)
        store = Store(this)

        val saved = store.playlistUrl
        if (saved != null && saved != Store.LOCAL) {
            b.urlInput.setText(saved)
        }

        b.loadButton.setOnClickListener { loadUrl(b.urlInput.text.toString()) }
        b.urlInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE ||
                actionId == EditorInfo.IME_ACTION_NEXT
            ) {
                hideKeyboard()
                b.loadButton.requestFocus()
                loadUrl(b.urlInput.text.toString())
                true
            } else {
                false
            }
        }

        b.codeButton.setOnClickListener { openTransfiles(b.codeInput.text.toString()) }
        b.codeInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE ||
                actionId == EditorInfo.IME_ACTION_NEXT
            ) {
                hideKeyboard()
                b.codeButton.requestFocus()
                openTransfiles(b.codeInput.text.toString())
                true
            } else {
                false
            }
        }

        startServer()
        b.urlInput.requestFocus()
    }

    /** Код с transfiles.ru: дальше страница сайта с капчей внутри приложения. */
    private fun openTransfiles(input: String) {
        val code = TransfilesCode.codeFrom(input)
        if (code == null) {
            showStatus(getString(R.string.setup_code_error), true)
            return
        }
        b.setupStatus.visibility = View.GONE
        startActivity(Intent(this, TransfilesActivity::class.java).putExtra(TransfilesActivity.EXTRA_CODE, code))
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        super.onDestroy()
    }

    private fun startServer() {
        val page = try {
            assets.open("phone.html").bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (e: Exception) {
            ""
        }
        val srv = LocalServer(
            page = page,
            onUrl = { url ->
                runOnUiThread {
                    b.urlInput.setText(url)
                    showStatus(getString(R.string.setup_received), false)
                    loadUrl(url)
                }
            },
            onPlaylist = { text ->
                runOnUiThread {
                    showStatus(getString(R.string.setup_file_received), false)
                    loadText(text)
                }
            }
        )
        val ip = LocalServer.localIp()
        if (ip == null || !srv.start()) {
            b.serverAddress.text = getString(R.string.setup_no_network)
            return
        }
        server = srv
        val address = "http://$ip:${srv.port}"
        b.serverAddress.text = getString(R.string.setup_browser, "$ip:${srv.port}")
        try {
            b.qrImage.setImageBitmap(Qr.bitmap(address, 480))
        } catch (e: Exception) {
            // без QR остаётся адрес текстом
        }
    }

    private fun loadUrl(input: String) {
        if (busy) return
        // Ссылка на transfiles - это страница с капчей, а не сам файл
        if (TransfilesCode.codeFromLink(input) != null) {
            openTransfiles(input)
            return
        }
        val url = PlaylistLoader.normalize(input)
        if (url.isEmpty()) {
            showStatus(getString(R.string.setup_error_empty), true)
            return
        }
        busy = true
        showStatus(getString(R.string.setup_loading), false)
        lifecycleScope.launch {
            try {
                val text = PlaylistLoader.fetch(url)
                val count = withContext(Dispatchers.Default) { M3uParser.parse(text).size }
                if (count == 0) {
                    showStatus(getString(R.string.setup_error_parse), true)
                } else {
                    withContext(Dispatchers.IO) { store.saveCache(text) }
                    store.playlistUrl = url
                    openMain()
                }
            } catch (e: Exception) {
                showStatus(getString(R.string.setup_error_load), true)
            } finally {
                busy = false
            }
        }
    }

    private fun loadText(text: String) {
        if (busy) return
        busy = true
        lifecycleScope.launch {
            try {
                val count = withContext(Dispatchers.Default) { M3uParser.parse(text).size }
                if (count == 0) {
                    showStatus(getString(R.string.setup_error_parse), true)
                } else {
                    withContext(Dispatchers.IO) { store.saveCache(text) }
                    store.playlistUrl = Store.LOCAL
                    openMain()
                }
            } catch (e: Exception) {
                showStatus(getString(R.string.setup_error_parse), true)
            } finally {
                busy = false
            }
        }
    }

    private fun openMain() {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_RELOAD, true)
        startActivity(intent)
        finish()
    }

    private fun showStatus(text: String, error: Boolean) {
        b.setupStatus.text = text
        b.setupStatus.setTextColor(ContextCompat.getColor(this, if (error) R.color.accent else R.color.light))
        b.setupStatus.visibility = View.VISIBLE
    }

    private fun hideKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(b.urlInput.windowToken, 0)
    }
}
