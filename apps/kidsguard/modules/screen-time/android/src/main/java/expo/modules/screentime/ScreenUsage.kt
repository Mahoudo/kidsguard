package expo.modules.screentime

import android.app.usage.UsageStatsManager
import android.content.Context
import java.util.Calendar

/** Shared today's-usage helper, used by both the module and the blocker service. */
object ScreenUsage {
  /** Total foreground minutes today across user apps (excludes our own app,
   *  launcher and system UI). Returns 0 on any failure / no permission. */
  fun todayMinutes(ctx: Context): Int {
    return try {
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val cal = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
      }
      val start = cal.timeInMillis
      val end = System.currentTimeMillis()
      val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end) ?: return 0
      var totalMs = 0L
      for (s in stats) {
        val p = s.packageName ?: continue
        if (p == ctx.packageName) continue
        if (p.contains("launcher") || p == "com.android.systemui" ||
            p.startsWith("com.android.settings")) continue
        totalMs += s.totalTimeInForeground
      }
      (totalMs / 60000L).toInt()
    } catch (e: Exception) {
      0
    }
  }
}
