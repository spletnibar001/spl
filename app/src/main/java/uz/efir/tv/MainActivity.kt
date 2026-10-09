package uz.efir.tv

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uz.efir.tv.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Главный экран: видео на весь экран, OSD при переключении,
 * список каналов поверх видео по кнопке OK.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_RELOAD = "uz.efir.tv.RELOAD"

        private const val TAB_FAV = "\u0001fav"
        private const val TAB_ALL = "\u0001all"
        private const val TAB_SETTINGS = "\u0001settings"

        private const val ACTION_REFRESH = 1
        private const val ACTION_CHANGE = 2
        private const val ACTION_HIDDEN = 3
        private const val ACTION_UNHIDE_ALL = 4

        private const val OSD_MS = 3_500L
        private const val TOAST_MS = 2_500L
        private const val PANEL_IDLE_MS = 30_000L
        private const val SWITCH_DELAY_MS = 350L
        private const val DIAL_DELAY_MS = 2_000L
        private const val BACK_EXIT_MS = 3_000L
        private const val OK_LONG_MS = 700L
        private const val PAGE = 8
        private const val PANEL_WIDTH_DP = 440
    }

    private lateinit var b: ActivityMainBinding
    private lateinit var store: Store
    private lateinit var adapter: ChannelAdapter

    private val handler = Handler(Looper.getMainLooper())
    private val clock = SimpleDateFormat("HH:mm", Locale.getDefault())

    private var player: ExoPlayer? = null
    private var httpFactory: DefaultHttpDataSource.Factory? = null

    private var channels: List<Channel> = emptyList()
    private var current: Channel? = null
    private var useHls = false
    private var retries = 0

    private var tabs: List<String> = emptyList()
    private var tabIndex = 0
    private var suppressSearch = false
    private var hiddenMode = false

    private var menuChannel: Channel? = null
    private var menuReturnPosition = 0

    /** Каналы без скрытых - именно они видны в списке и листаются ▲▼. */
    private val visibleChannels: List<Channel>
        get() = channels.filter { !store.isHidden(it) }

    private var pendingScope: List<Channel> = emptyList()
    private var pendingIndex = -1
    private val dial = StringBuilder()
    private var okLongHandled = false
    private var lastBack = 0L

    private val fontRegular by lazy { ResourcesCompat.getFont(this, R.font.golos_regular) }
    private val fontSemibold by lazy { ResourcesCompat.getFont(this, R.font.golos_semibold) }

    private val hideOsdRunnable = Runnable { b.osd.visibility = View.GONE }
    private val hideToastRunnable = Runnable { b.toast.visibility = View.GONE }
    private val panelIdleRunnable = Runnable { onPanelIdle() }
    private val retryRunnable = Runnable { current?.let { startPlayback(it) } }
    private val switchRunnable = Runnable { commitSwitch() }
    private val dialRunnable = Runnable { commitDial() }
    private val okLongRunnable = Runnable {
        okLongHandled = true
        current?.let { toggleFavorite(it) }
    }

    // ---------- Жизненный цикл ----------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        store = Store(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()
        setupPanel()

        if (store.playlistUrl == null) {
            openSetup(finishSelf = true)
            return
        }
        // Сразу после настройки плейлист только что скачан - второй раз не грузим
        val justLoaded = intent?.getBooleanExtra(EXTRA_RELOAD, false) == true
        loadFromCache(resetChannel = false, refreshAfter = !justLoaded)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(EXTRA_RELOAD, false)) {
            closePanel()
            loadFromCache(resetChannel = true, refreshAfter = false)
        }
    }

    override fun onStart() {
        super.onStart()
        initPlayer()
        current?.let { startPlayback(it) }
    }

    override fun onStop() {
        handler.removeCallbacks(retryRunnable)
        releasePlayer()
        super.onStop()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
    }

    // ---------- Плейлист ----------

    private fun loadFromCache(resetChannel: Boolean, refreshAfter: Boolean) {
        lifecycleScope.launch {
            val list = withContext(Dispatchers.IO) {
                val text = store.loadCache()
                if (text == null) emptyList() else M3uParser.parse(text)
            }
            if (list.isEmpty()) {
                openSetup(finishSelf = true)
                return@launch
            }
            if (resetChannel) current = null
            applyPlaylist(list)
            if (refreshAfter) refresh(userInitiated = false)
        }
    }

    private fun applyPlaylist(list: List<Channel>) {
        if (list.isEmpty()) return
        channels = list
        buildTabs()
        val previous = current
        val target = previous?.let { p -> list.firstOrNull { it.key == p.key } }
            ?: list.firstOrNull { it.key == store.lastChannel }
            ?: list.first()
        if (previous == null || previous.url != target.url || previous.key != target.key) {
            play(target, showInfo = previous == null)
        } else {
            current = target
        }
        if (b.panel.visibility == View.VISIBLE) refreshRows()
    }

    private fun refresh(userInitiated: Boolean) {
        val url = store.playlistUrl ?: return
        if (url == Store.LOCAL) {
            if (userInitiated) showToast(getString(R.string.local_playlist))
            return
        }
        if (userInitiated) showToast(getString(R.string.refreshing))
        lifecycleScope.launch {
            try {
                val text = PlaylistLoader.fetch(url)
                val list = withContext(Dispatchers.Default) { M3uParser.parse(text) }
                if (list.isNotEmpty()) {
                    withContext(Dispatchers.IO) { store.saveCache(text) }
                    applyPlaylist(list)
                    if (userInitiated) showToast(getString(R.string.refreshed, list.size))
                } else if (userInitiated) {
                    showToast(getString(R.string.refresh_failed))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (userInitiated) showToast(getString(R.string.refresh_failed))
            }
        }
    }

    private fun openSetup(finishSelf: Boolean) {
        startActivity(Intent(this, SetupActivity::class.java))
        if (finishSelf) finish()
    }

    // ---------- Плеер ----------

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            when (playbackState) {
                Player.STATE_BUFFERING -> b.loading.visibility = View.VISIBLE
                Player.STATE_READY -> {
                    b.loading.visibility = View.GONE
                    retries = 0
                    hideStatus()
                }
                Player.STATE_ENDED -> {
                    b.loading.visibility = View.GONE
                    scheduleRetry()
                }
                else -> b.loading.visibility = View.GONE
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            b.loading.visibility = View.GONE
            val channel = current ?: return
            val code = error.errorCode
            val formatProblem = code == PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED ||
                code == PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED
            if (!useHls && formatProblem && guessMime(channel.url) != MimeTypes.APPLICATION_M3U8) {
                // Ссылка без расширения может оказаться HLS - пробуем так
                useHls = true
                startPlayback(channel)
                return
            }
            if (code == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                player?.let {
                    it.seekToDefaultPosition()
                    it.prepare()
                }
                return
            }
            scheduleRetry()
        }
    }

    private fun initPlayer() {
        if (player != null) return
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(PlaylistLoader.USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
        httpFactory = http
        val renderers = DefaultRenderersFactory(this).setEnableDecoderFallback(true)
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(15_000, 50_000, 1_500, 3_000)
            .build()
        val p = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(this, http)))
            .setLoadControl(loadControl)
            .build()
        p.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            true
        )
        // Субтитры, встроенные в поток, по умолчанию не показываем
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
        p.addListener(playerListener)
        p.playWhenReady = true
        b.playerView.player = p
        player = p
    }

    private fun releasePlayer() {
        val p = player ?: return
        p.removeListener(playerListener)
        p.release()
        player = null
        b.playerView.player = null
        b.loading.visibility = View.GONE
    }

    private fun play(channel: Channel, showInfo: Boolean) {
        current = channel
        store.lastChannel = channel.key
        useHls = false
        retries = 0
        handler.removeCallbacks(retryRunnable)
        hideStatus()
        if (showInfo) showOsd(channel)
        if (b.panel.visibility == View.VISIBLE) adapter.notifyDataSetChanged()
        startPlayback(channel)
    }

    private fun startPlayback(channel: Channel) {
        val p = player ?: return
        httpFactory?.let { factory ->
            factory.setUserAgent(channel.userAgent ?: PlaylistLoader.USER_AGENT)
            val headers = HashMap<String, String>()
            channel.referrer?.let { headers["Referer"] = it }
            factory.setDefaultRequestProperties(headers)
        }
        val item = MediaItem.Builder().setUri(channel.url)
        val mime = if (useHls) MimeTypes.APPLICATION_M3U8 else guessMime(channel.url)
        if (mime != null) item.setMimeType(mime)
        p.setMediaItem(item.build())
        p.prepare()
        p.playWhenReady = true
    }

    private fun guessMime(url: String): String? {
        val path = url.substringBefore('?').substringBefore('#').lowercase()
        return when {
            path.endsWith(".m3u8") || path.endsWith(".m3u") -> MimeTypes.APPLICATION_M3U8
            url.contains("m3u8", ignoreCase = true) -> MimeTypes.APPLICATION_M3U8
            path.endsWith(".ts") -> MimeTypes.VIDEO_MP2T
            else -> null
        }
    }

    private fun scheduleRetry() {
        handler.removeCallbacks(retryRunnable)
        retries++
        if (retries >= 2) showStatus(getString(R.string.status_unavailable))
        val delay = when {
            retries <= 1 -> 1_000L
            retries <= 4 -> 3_000L
            else -> 8_000L
        }
        handler.postDelayed(retryRunnable, delay)
    }

    // ---------- Сообщения на экране ----------

    private fun showOsd(channel: Channel) {
        if (b.panel.visibility == View.VISIBLE) return
        b.osdNumber.text = channel.number.toString()
        b.osdName.text = channel.name
        val group = channel.group
        b.osdGroup.text = group ?: ""
        b.osdGroup.visibility = if (group.isNullOrBlank()) View.GONE else View.VISIBLE
        b.osdInitials.text = channel.initials
        Logos.show(b.osdLogo, b.osdInitials, channel.logo)
        b.osdFav.visibility = if (store.isFavorite(channel)) View.VISIBLE else View.GONE
        b.osdClock.text = clock.format(Date())
        b.osd.visibility = View.VISIBLE
        handler.removeCallbacks(hideOsdRunnable)
        handler.postDelayed(hideOsdRunnable, OSD_MS)
    }

    private fun hideOsd() {
        handler.removeCallbacks(hideOsdRunnable)
        b.osd.visibility = View.GONE
    }

    private fun showToast(text: String) {
        b.toast.text = text
        b.toast.visibility = View.VISIBLE
        handler.removeCallbacks(hideToastRunnable)
        handler.postDelayed(hideToastRunnable, TOAST_MS)
    }

    private fun showStatus(text: String) {
        b.status.text = text
        b.status.visibility = View.VISIBLE
    }

    private fun hideStatus() {
        b.status.visibility = View.GONE
    }

    // ---------- Переключение каналов ----------

    private fun switchChannel(delta: Int) {
        if (channels.isEmpty()) return
        if (pendingIndex < 0) {
            var scope = channelsOf(store.lastTab)
            var index = scope.indexOfFirst { it.key == current?.key }
            if (index < 0) {
                scope = visibleChannels
                index = scope.indexOfFirst { it.key == current?.key }
            }
            pendingScope = scope
            pendingIndex = if (index < 0) 0 else index
        }
        val size = pendingScope.size
        if (size == 0) return
        pendingIndex = ((pendingIndex + delta) % size + size) % size
        showOsd(pendingScope[pendingIndex])
        handler.removeCallbacks(switchRunnable)
        handler.postDelayed(switchRunnable, SWITCH_DELAY_MS)
    }

    private fun commitSwitch() {
        handler.removeCallbacks(switchRunnable)
        val target = pendingScope.getOrNull(pendingIndex)
        pendingIndex = -1
        pendingScope = emptyList()
        if (target != null && target.key != current?.key) play(target, showInfo = false)
    }

    private fun onDigit(digit: Int) {
        if (dial.length >= 4) dial.setLength(0)
        dial.append(digit)
        b.dial.text = dial.toString()
        b.dial.visibility = View.VISIBLE
        handler.removeCallbacks(dialRunnable)
        handler.postDelayed(dialRunnable, DIAL_DELAY_MS)
    }

    private fun commitDial() {
        handler.removeCallbacks(dialRunnable)
        val number = dial.toString().toIntOrNull()
        dial.setLength(0)
        b.dial.visibility = View.GONE
        if (number == null) return
        val target = visibleChannels.firstOrNull { it.number == number }
        if (target == null) {
            showToast(getString(R.string.no_channel, number))
            return
        }
        if (pendingIndex >= 0) {
            handler.removeCallbacks(switchRunnable)
            pendingIndex = -1
            pendingScope = emptyList()
        }
        if (target.key != current?.key) play(target, showInfo = true) else showOsd(target)
    }

    private fun cancelDial() {
        handler.removeCallbacks(dialRunnable)
        dial.setLength(0)
        b.dial.visibility = View.GONE
    }

    private fun toggleFavorite(channel: Channel, position: Int = focusedPosition()) {
        val added = store.toggleFavorite(channel)
        showToast(getString(if (added) R.string.fav_added else R.string.fav_removed, channel.name))
        if (b.panel.visibility == View.VISIBLE) {
            val onFavTab = tabs.getOrNull(tabIndex) == TAB_FAV && b.searchInput.text.isNullOrEmpty()
            if (onFavTab) {
                refreshRows()
                focusRow(position)
            } else {
                val index = adapter.indexOfChannel(channel.key)
                if (index >= 0) adapter.notifyItemChanged(index)
            }
        }
        if (b.osd.visibility == View.VISIBLE && current?.key == channel.key) {
            b.osdFav.visibility = if (added) View.VISIBLE else View.GONE
        }
    }

    // ---------- Список каналов ----------

    private fun setupPanel() {
        adapter = ChannelAdapter(
            isFavorite = { store.isFavorite(it) },
            isPlaying = { it.key == current?.key },
            onClick = { onRowClick(it) },
            onLongClick = { onRowLongClick(it) }
        )
        b.channelList.layoutManager = LinearLayoutManager(this)
        b.channelList.adapter = adapter
        b.channelList.itemAnimator = null
        // Сам список фокус не держит - только его строки, иначе фокус «пропадает»
        b.channelList.isFocusable = false
        b.channelList.isFocusableInTouchMode = false
        b.channelList.descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
        b.searchInput.doAfterTextChanged {
            if (!suppressSearch && b.panel.visibility == View.VISIBLE) refreshRows()
        }
        b.searchInput.setOnEditorActionListener { _, _, _ ->
            hideKeyboard()
            focusRow(0)
            true
        }
        setupActionMenu()
    }

    // ---------- Меню канала: избранное и скрытие ----------

    private fun setupActionMenu() {
        // Фокус не уходит из меню на строки под ним
        b.actionFav.nextFocusUpId = b.actionFav.id
        b.actionFav.nextFocusDownId = b.actionHide.id
        b.actionHide.nextFocusUpId = b.actionFav.id
        b.actionHideGroup.nextFocusUpId = b.actionHide.id
        b.actionHideGroup.nextFocusDownId = b.actionHideGroup.id

        b.actionFav.setOnClickListener {
            val channel = menuChannel ?: return@setOnClickListener
            val position = menuReturnPosition
            closeActionMenu()
            toggleFavorite(channel, position)
            focusRow(position)
        }
        b.actionHide.setOnClickListener {
            val channel = menuChannel ?: return@setOnClickListener
            val position = menuReturnPosition
            closeActionMenu()
            store.hideChannel(channel)
            showToast(getString(R.string.hidden_channel, channel.name))
            afterHiddenChanged(position)
        }
        b.actionHideGroup.setOnClickListener {
            val channel = menuChannel ?: return@setOnClickListener
            val group = channel.group ?: return@setOnClickListener
            val position = menuReturnPosition
            closeActionMenu()
            store.hideGroup(group)
            showToast(getString(R.string.hidden_group, group))
            afterHiddenChanged(position)
        }
    }

    private fun openActionMenu(channel: Channel) {
        menuChannel = channel
        menuReturnPosition = focusedPosition()
        b.actionTitle.text = channel.name
        b.actionFav.setText(if (store.isFavorite(channel)) R.string.menu_unfav else R.string.menu_fav)
        val group = channel.group
        if (group.isNullOrBlank()) {
            b.actionHideGroup.visibility = View.GONE
            b.actionHide.nextFocusDownId = b.actionHide.id
        } else {
            b.actionHideGroup.visibility = View.VISIBLE
            b.actionHideGroup.text = getString(R.string.menu_hide_group, group)
            b.actionHide.nextFocusDownId = b.actionHideGroup.id
        }
        b.actionMenu.visibility = View.VISIBLE
        b.actionFav.requestFocus()
    }

    private fun closeActionMenu() {
        b.actionMenu.visibility = View.GONE
        menuChannel = null
    }

    private fun afterHiddenChanged(position: Int) {
        buildTabs()
        refreshRows()
        focusRow(position)
    }

    private fun handleMenuKey(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE, KeyEvent.KEYCODE_MENU -> {
                if (event.action == KeyEvent.ACTION_UP) {
                    val position = menuReturnPosition
                    closeActionMenu()
                    focusRow(position)
                }
                return true
            }
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_CHANNEL_DOWN,
            KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_PAGE_DOWN -> return true
        }
        return false
    }

    private fun buildTabs() {
        val previous = tabs.getOrNull(tabIndex) ?: store.lastTab
        val groups = LinkedHashSet<String>()
        for (c in visibleChannels) {
            c.group?.let { groups.add(it) }
        }
        tabs = listOf(TAB_FAV, TAB_ALL) + groups + listOf(TAB_SETTINGS)
        val index = if (previous != null) tabs.indexOf(previous) else -1
        tabIndex = if (index >= 0) index else tabs.indexOf(TAB_ALL)
    }

    private fun tabLabel(tab: String): String = when (tab) {
        TAB_FAV -> getString(R.string.tab_fav)
        TAB_ALL -> getString(R.string.tab_all)
        TAB_SETTINGS -> getString(R.string.tab_settings)
        else -> tab
    }

    private fun channelsOf(tab: String?): List<Channel> {
        val visible = visibleChannels
        return when (tab) {
            TAB_FAV -> visible.filter { store.isFavorite(it) }
            null, TAB_ALL, TAB_SETTINGS -> visible
            else -> visible.filter { it.group == tab }
        }
    }

    private fun renderTabs() {
        val container = b.tabs
        container.removeAllViews()
        val accent = ContextCompat.getColor(this, R.color.accent)
        val textColor = ContextCompat.getColor(this, R.color.text)
        val mutedColor = ContextCompat.getColor(this, R.color.muted)
        tabs.forEachIndexed { i, tab ->
            val active = i == tabIndex
            val column = LinearLayout(this)
            column.orientation = LinearLayout.VERTICAL

            val label = TextView(this)
            label.text = tabLabel(tab)
            label.textSize = 15f
            label.typeface = if (active) fontSemibold else fontRegular
            label.setTextColor(if (active) textColor else mutedColor)
            label.gravity = Gravity.CENTER_VERTICAL
            label.maxLines = 1
            column.addView(label, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, 0, 1f))

            val underline = View(this)
            underline.setBackgroundColor(accent)
            underline.visibility = if (active) View.VISIBLE else View.INVISIBLE
            column.addView(underline, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))

            val params = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            if (i < tabs.size - 1) params.marginEnd = dp(18)
            container.addView(column, params)
        }
        b.tabsScroll.post {
            val active = container.getChildAt(tabIndex) ?: return@post
            val target = active.left - (b.tabsScroll.width - active.width) / 2
            b.tabsScroll.smoothScrollTo(maxOf(0, target), 0)
        }
    }

    private fun refreshRows() {
        val query = b.searchInput.text?.toString()?.trim().orEmpty()
        val tab = tabs.getOrNull(tabIndex) ?: TAB_ALL
        val rows: List<Row> = when {
            query.isNotEmpty() -> {
                val digits = query.all { it.isDigit() }
                visibleChannels.filter { c ->
                    (digits && c.number.toString().startsWith(query)) ||
                        c.name.contains(query, ignoreCase = true)
                }.map { Row.Ch(it) }
            }
            tab == TAB_SETTINGS && hiddenMode -> {
                val list = ArrayList<Row>()
                list.add(Row.Action(ACTION_UNHIDE_ALL, getString(R.string.action_unhide_all)))
                for (group in store.hiddenGroupList()) {
                    list.add(Row.Restore(group, true, getString(R.string.restore_group, group)))
                }
                for (key in store.hiddenChannelList()) {
                    list.add(Row.Restore(key, false, key))
                }
                list
            }
            tab == TAB_SETTINGS -> {
                val list = ArrayList<Row>()
                list.add(Row.Action(ACTION_REFRESH, getString(R.string.action_refresh)))
                list.add(Row.Action(ACTION_CHANGE, getString(R.string.action_change)))
                val hidden = store.hiddenCount()
                if (hidden > 0) list.add(Row.Action(ACTION_HIDDEN, getString(R.string.action_hidden, hidden)))
                list
            }
            else -> channelsOf(tab).map { Row.Ch(it) }
        }
        adapter.submit(rows)
        b.emptyText.text = when {
            rows.isNotEmpty() -> ""
            query.isNotEmpty() -> getString(R.string.empty_search)
            tab == TAB_FAV -> getString(R.string.empty_fav)
            else -> ""
        }
        b.emptyText.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
        renderTabs()
    }

    private fun openPanel() {
        if (channels.isEmpty()) return
        if (pendingIndex >= 0) commitSwitch()
        hideOsd()
        hiddenMode = false
        if (tabs.getOrNull(tabIndex) == TAB_SETTINGS) {
            // Настройки нужны редко - список всегда открывается с каналами
            val last = tabs.indexOf(store.lastTab ?: TAB_ALL)
            tabIndex = if (last >= 0 && tabs[last] != TAB_SETTINGS) last else tabs.indexOf(TAB_ALL)
        }
        shiftOverlays(panelOpen = true)
        b.panel.visibility = View.VISIBLE
        b.panel.alpha = 0f
        b.panel.animate().alpha(1f).setDuration(120).start()
        refreshRows()
        val index = adapter.indexOfChannel(current?.key)
        focusRow(if (index >= 0) index else 0)
        bumpPanelTimer()
    }

    private fun closePanel() {
        if (b.panel.visibility != View.VISIBLE) return
        handler.removeCallbacks(panelIdleRunnable)
        hideKeyboard()
        closeActionMenu()
        hiddenMode = false
        b.panel.visibility = View.GONE
        shiftOverlays(panelOpen = false)
        clearSearch()
    }

    /** Пока открыт список, сообщения и индикатор загрузки - по центру видимой части видео. */
    private fun shiftOverlays(panelOpen: Boolean) {
        val shift = if (panelOpen) dp(PANEL_WIDTH_DP) / 2f else 0f
        b.centerBox.translationX = shift
        b.toast.translationX = shift
    }

    private fun clearSearch() {
        if (b.searchInput.text.isNullOrEmpty()) return
        suppressSearch = true
        b.searchInput.setText("")
        suppressSearch = false
    }

    private fun onPanelIdle() {
        if (b.searchInput.hasFocus()) {
            bumpPanelTimer()
        } else {
            closePanel()
        }
    }

    private fun bumpPanelTimer() {
        handler.removeCallbacks(panelIdleRunnable)
        if (b.panel.visibility == View.VISIBLE) handler.postDelayed(panelIdleRunnable, PANEL_IDLE_MS)
    }

    private fun switchTab(delta: Int) {
        if (tabs.isEmpty()) return
        tabIndex = (tabIndex + delta + tabs.size) % tabs.size
        hiddenMode = false
        clearSearch()
        refreshRows()
        val index = adapter.indexOfChannel(current?.key)
        focusRow(if (index >= 0) index else 0)
    }

    private fun focusRow(index: Int) {
        val count = adapter.itemCount
        if (count == 0) {
            b.searchInput.requestFocus()
            return
        }
        val i = index.coerceIn(0, count - 1)
        val manager = b.channelList.layoutManager as LinearLayoutManager
        // Над выбранной строкой оставляем две целые строки, без обрезанных краёв
        manager.scrollToPositionWithOffset(i, minOf(i, 2) * dp(45))
        b.channelList.post { requestRowFocus(i, 30) }
    }

    /** Ждём, пока список разложится (на медленных приставках это заметно дольше кадра), и ставим фокус на строку. */
    private fun requestRowFocus(index: Int, attempts: Int) {
        if (b.panel.visibility != View.VISIBLE) return
        val holder = b.channelList.findViewHolderForAdapterPosition(index)
        if (holder != null && holder.itemView.requestFocus()) return
        if (attempts > 0) {
            b.channelList.postDelayed({ requestRowFocus(index, attempts - 1) }, 50)
        } else {
            b.channelList.getChildAt(0)?.requestFocus() ?: b.searchInput.requestFocus()
        }
    }

    private fun focusedPosition(): Int {
        val child = b.channelList.focusedChild ?: return 0
        val position = b.channelList.getChildAdapterPosition(child)
        return if (position == RecyclerView.NO_POSITION) 0 else position
    }

    private fun focusedChannel(): Channel? {
        val child = b.channelList.focusedChild ?: return null
        val position = b.channelList.getChildAdapterPosition(child)
        val row = adapter.rows.getOrNull(position) as? Row.Ch ?: return null
        return row.channel
    }

    private fun pageBy(delta: Int) {
        if (adapter.itemCount == 0) return
        focusRow((focusedPosition() + delta).coerceIn(0, adapter.itemCount - 1))
    }

    private fun onRowClick(row: Row) {
        when (row) {
            is Row.Ch -> {
                val channel = row.channel
                store.lastTab = if (b.searchInput.text.isNullOrEmpty()) tabs.getOrNull(tabIndex) else TAB_ALL
                val sameAndPlaying = channel.key == current?.key &&
                    player?.playbackState == Player.STATE_READY
                closePanel()
                if (sameAndPlaying) showOsd(channel) else play(channel, showInfo = true)
            }
            is Row.Action -> when (row.id) {
                ACTION_REFRESH -> {
                    closePanel()
                    refresh(userInitiated = true)
                }
                ACTION_CHANGE -> {
                    closePanel()
                    openSetup(finishSelf = false)
                }
                ACTION_HIDDEN -> {
                    hiddenMode = true
                    refreshRows()
                    focusRow(0)
                }
                ACTION_UNHIDE_ALL -> {
                    store.unhideAll()
                    showToast(getString(R.string.restored_all))
                    hiddenMode = false
                    afterHiddenChanged(0)
                }
            }
            is Row.Restore -> {
                val position = focusedPosition()
                if (row.isGroup) store.unhideGroup(row.key) else store.unhideChannel(row.key)
                showToast(getString(R.string.restored, row.key))
                if (store.hiddenCount() == 0) hiddenMode = false
                afterHiddenChanged(position)
            }
        }
    }

    private fun onRowLongClick(row: Row) {
        if (row is Row.Ch) openActionMenu(row.channel)
    }

    private fun hideKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(b.searchInput.windowToken, 0)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

    // ---------- Пульт ----------

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val handled = if (b.panel.visibility == View.VISIBLE) {
            if (event.action == KeyEvent.ACTION_DOWN) bumpPanelTimer()
            if (b.actionMenu.visibility == View.VISIBLE) handleMenuKey(event) else handlePanelKey(event)
        } else {
            handleWatchKey(event)
        }
        return handled || super.dispatchKeyEvent(event)
    }

    private fun handlePanelKey(event: KeyEvent): Boolean {
        val code = event.keyCode
        val down = event.action == KeyEvent.ACTION_DOWN
        val up = event.action == KeyEvent.ACTION_UP
        val inSearch = b.searchInput.hasFocus()
        val searchEmpty = b.searchInput.text.isNullOrEmpty()
        when (code) {
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                if (inSearch && !searchEmpty) return false
                if (down) switchTab(if (code == KeyEvent.KEYCODE_DPAD_LEFT) -1 else 1)
                return true
            }
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> {
                if (up) {
                    if (!searchEmpty) {
                        clearSearch()
                        refreshRows()
                        val index = adapter.indexOfChannel(current?.key)
                        focusRow(if (index >= 0) index else 0)
                    } else if (hiddenMode) {
                        // Из списка скрытых - обратно к настройкам
                        hiddenMode = false
                        refreshRows()
                        focusRow(2)
                    } else {
                        closePanel()
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_MENU -> {
                if (up) focusedChannel()?.let { openActionMenu(it) }
                return true
            }
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> {
                if (down) pageBy(-PAGE)
                return true
            }
            KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> {
                if (down) pageBy(PAGE)
                return true
            }
            KeyEvent.KEYCODE_GUIDE -> {
                if (up) closePanel()
                return true
            }
        }
        return false
    }

    private fun handleWatchKey(event: KeyEvent): Boolean {
        val code = event.keyCode
        val down = event.action == KeyEvent.ACTION_DOWN
        val up = event.action == KeyEvent.ACTION_UP
        when (code) {
            KeyEvent.KEYCODE_DPAD_UP -> {
                if (down) switchChannel(-1)
                return true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (down) switchChannel(1)
                return true
            }
            KeyEvent.KEYCODE_CHANNEL_UP -> {
                if (down) switchChannel(1)
                return true
            }
            KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                if (down) switchChannel(-1)
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                if (down) {
                    if (event.repeatCount == 0) {
                        // Удержание OK определяем по таймеру: не все пульты повторяют нажатие
                        okLongHandled = false
                        handler.removeCallbacks(okLongRunnable)
                        handler.postDelayed(okLongRunnable, OK_LONG_MS)
                    }
                } else if (up) {
                    handler.removeCallbacks(okLongRunnable)
                    when {
                        okLongHandled -> okLongHandled = false
                        dial.isNotEmpty() -> commitDial()
                        else -> openPanel()
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_GUIDE -> {
                if (up) openPanel()
                return true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_INFO -> {
                if (down && event.repeatCount == 0) current?.let { showOsd(it) }
                return true
            }
            KeyEvent.KEYCODE_MENU -> {
                if (down && event.repeatCount == 0) current?.let { toggleFavorite(it) }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                if (down && event.repeatCount == 0) {
                    player?.let { p ->
                        p.playWhenReady = when (code) {
                            KeyEvent.KEYCODE_MEDIA_PLAY -> true
                            KeyEvent.KEYCODE_MEDIA_PAUSE -> false
                            else -> !p.playWhenReady
                        }
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> {
                if (up) onWatchBack()
                return true
            }
        }
        val digit = digitOf(code)
        if (digit >= 0) {
            if (down && event.repeatCount == 0) onDigit(digit)
            return true
        }
        return false
    }

    private fun onWatchBack() {
        if (dial.isNotEmpty()) {
            cancelDial()
            return
        }
        val now = SystemClock.elapsedRealtime()
        if (now - lastBack < BACK_EXIT_MS) {
            finish()
        } else {
            lastBack = now
            hideOsd()
            showToast(getString(R.string.press_back_again))
        }
    }

    private fun digitOf(code: Int): Int = when (code) {
        in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> code - KeyEvent.KEYCODE_0
        in KeyEvent.KEYCODE_NUMPAD_0..KeyEvent.KEYCODE_NUMPAD_9 -> code - KeyEvent.KEYCODE_NUMPAD_0
        else -> -1
    }
}
