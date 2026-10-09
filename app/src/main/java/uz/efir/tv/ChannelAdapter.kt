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
            }
            is Row.Action -> {
                b.number.visibility = View.INVISIBLE
                b.badge.visibility = View.GONE
                b.name.text = row.title
                b.name.setTextColor(AppCompatResources.getColorStateList(ctx, R.color.row_text))
                b.playing.visibility = View.GONE
                b.fav.visibility = View.GONE
            }
        }
        holder.itemView.setOnClickListener { onClick(row) }
        holder.itemView.setOnLongClickListener {
            onLongClick(row)
            true
        }
    }
}
