package expo.modules.screentime

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.view.accessibility.AccessibilityEvent
import java.time.LocalTime

/**
 * Watches the foreground app and sends the child back to the home screen when:
 *  - the device is remotely locked,
 *  - a Focus window (study / sleep) is active,
 *  - the foreground app is in the blocked list.
 * Rules are written to SharedPreferences by the JS side (setBlockRules).
 * Transparent parental control — no content is read.
 */
class AppBlockerService : AccessibilityService() {

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName) return
    // never block the launcher, system UI or settings
    if (pkg.contains("launcher") || pkg == "com.android.systemui" ||
      pkg.startsWith("com.android.settings")
    ) return

    val prefs = getSharedPreferences("kidsguard_block", Context.MODE_PRIVATE)
    val locked = prefs.getBoolean("locked", false)
    val blocked = prefs.getStringSet("blocked", emptySet()) ?: emptySet()

    val shouldBlock = locked || inFocusWindow(prefs) || blocked.contains(pkg)
    if (shouldBlock) {
      performGlobalAction(GLOBAL_ACTION_HOME)
    }
  }

  override fun onInterrupt() {}

  private fun inFocusWindow(prefs: android.content.SharedPreferences): Boolean {
    val now = LocalTime.now()
    if (prefs.getBoolean("studyEnabled", false) &&
      within(now, prefs.getString("studyStart", null), prefs.getString("studyEnd", null))
    ) return true
    if (prefs.getBoolean("sleepEnabled", false) &&
      within(now, prefs.getString("sleepStart", null), prefs.getString("sleepEnd", null))
    ) return true
    return false
  }

  private fun within(now: LocalTime, start: String?, end: String?): Boolean {
    val s = parse(start) ?: return false
    val e = parse(end) ?: return false
    return if (s <= e) {
      now >= s && now < e
    } else {
      // overnight window (e.g. 21:00 -> 06:00)
      now >= s || now < e
    }
  }

  private fun parse(t: String?): LocalTime? {
    if (t.isNullOrBlank()) return null
    val parts = t.split(":")
    return try {
      LocalTime.of(parts[0].toInt(), parts.getOrElse(1) { "0" }.toInt())
    } catch (e: Exception) {
      null
    }
  }
}
