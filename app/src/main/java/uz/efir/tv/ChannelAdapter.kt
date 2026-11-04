package uz.efir.tv

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.content.res.AppCompatResources
import androidx.recyclerview.widget.RecyclerView
import uz.efir.tv.databinding.ItemChannelBinding

class ChannelAdapter(
    private val isFavorite: (Channel) -> Boolean,
    private val isPlaying: (Channel) -> Boolean,
    private val epgFor: (Channel) -> NowNext?,
    private val epgReady: () -> Boolean,
    private val onClick: (Row) -> Unit,
    private val onLongClick: (Row) -> Unit
) : RecyclerView.Adapter<ChannelAdapter.Holder>() {

    var rows: List<Row> = emptyList()
        private set

    init {
        setHasStableIds(true)
    }

    class Holder(val b: ItemChannelBinding) : RecyclerView.ViewHolder(b.root)

    fun submit(list: List<Row>) {
        rows = list
        notifyDataSetChanged()
    }

    fun indexOfChannel(key: String?): Int {
        if (key == null) return -1
        return rows.indexOfFirst { it is Row.Ch && it.channel.key == key }
    }

    override fun getItemCount(): Int = rows.size

    override fun getItemId(position: Int): Long = when (val row = rows[position]) {
        is Row.Ch -> row.channel.number.toLong()
        is Row.Action -> -row.id.toLong()
        is Row.Restore -> 1_000_000_000L + (row.key.hashCode().toLong() and 0x7FFFFFFFL) * 2 + (if (row.isGroup) 1 else 0)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val binding = ItemChannelBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return Holder(binding)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val row = rows[position]
        val b = holder.b
        val ctx = holder.itemView.context
        when (row) {
            is Row.Ch -> {
                val c = row.channel
                val playing = isPlaying(c)
                b.number.visibility = View.VISIBLE
                b.number.text = c.number.toString()
                b.number.setTextColor(
                    AppCompatResources.getColorStateList(ctx, if (playing) R.color.row_text_playing else R.color.row_number)
                )
                b.badge.visibility = View.VISIBLE
                b.initials.text = c.initials
                Logos.show(b.logo, b.initials, c.logo)
                b.name.text = c.name
                b.name.setTextColor(
                    AppCompatResources.getColorStateList(ctx, if (playing) R.color.row_text_playing else R.color.row_text)
                )
                b.playing.visibility = if (playing) View.VISIBLE else View.GONE
                b.fav.visibility = if (isFavorite(c)) View.VISIBLE else View.GONE
                bindEpg(b, c)
                setHeight(holder.itemView, 54)
            }
            is Row.Action -> bindPlain(b, row.title)
            is Row.Restore -> bindPlain(b, row.title)
        }
        holder.itemView.setOnClickListener { onClick(row) }
        holder.itemView.setOnLongClickListener {
            onLongClick(row)
            true
        }
    }

    private val clock = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())

    private fun bindEpg(b: ItemChannelBinding, c: Channel) {
        val ctx = b.root.context
        val nn = epgFor(c)
        val p = nn?.now ?: nn?.next
        when {
            p != null -> {
                b.prog.text = clock.format(java.util.Date(p.start)) + "  " + p.title
                b.prog.setTextColor(AppCompatResources.getColorStateList(ctx, R.color.row_prog))
                b.prog.visibility = View.VISIBLE
            }
            epgReady() -> {
                b.prog.text = ctx.getString(R.string.epg_none)
                b.prog.setTextColor(AppCompatResources.getColorStateList(ctx, R.color.row_icon_muted))
                b.prog.visibility = View.VISIBLE
            }
            else -> b.prog.visibility = View.GONE
        }
        val now = nn?.now
        if (now != null && now.stop > now.start) {
            val part = ((System.currentTimeMillis() - now.start) * 1000 / (now.stop - now.start)).coerceIn(0, 1000)
            (b.progBar.layoutParams as android.widget.LinearLayout.LayoutParams).weight = part.toFloat()
            b.progBar.requestLayout()
            b.progTrack.visibility = View.VISIBLE
        } else {
            b.progTrack.visibility = if (b.prog.visibility == View.VISIBLE) View.INVISIBLE else View.GONE
        }
    }

    private fun setHeight(view: View, dpValue: Int) {
        val px = (dpValue * view.resources.displayMetrics.density).toInt()
        val lp = view.layoutParams ?: return
        if (lp.height != px) {
            lp.height = px
            view.layoutParams = lp
        }
    }

    private fun bindPlain(b: ItemChannelBinding, title: String) {
        val ctx = b.root.context
        setHeight(b.root, 42)
        b.prog.visibility = View.GONE
        b.progTrack.visibility = View.GONE
        b.number.visibility = View.INVISIBLE
        b.badge.visibility = View.GONE
        b.name.text = title
        b.name.setTextColor(AppCompatResources.getColorStateList(ctx, R.color.row_text))
        b.playing.visibility = View.GONE
        b.fav.visibility = View.GONE
    }
}
