package expo.modules.screentime

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
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

    // Anti-uninstall guard: if the child reaches our app-info / uninstall screen
    // (Settings or the package installer), bounce them home before they confirm.
    if (isUninstallSurface(pkg) && windowMentionsSelf()) {
      performGlobalAction(GLOBAL_ACTION_HOME)
      return
    }

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

  // Settings app-info page or the package installer (uninstall dialog).
  private fun isUninstallSurface(pkg: String): Boolean {
    return pkg.startsWith("com.android.settings") ||
      pkg.contains("packageinstaller") ||
      pkg.contains("packagemanager")
  }

  // True if the currently visible window mentions our app (so we only bounce
  // when KidsGuard itself is the uninstall/app-info target, not other apps).
  private fun windowMentionsSelf(): Boolean {
    val root = rootInActiveWindow ?: return false
    val targets = listOf(packageName, "KidsGuard")
    return nodeMentions(root, targets)
  }

  private fun nodeMentions(node: AccessibilityNodeInfo?, targets: List<String>): Boolean {
    if (node == null) return false
    val txt = (node.text?.toString() ?: "") + " " + (node.contentDescription?.toString() ?: "")
    if (targets.any { txt.contains(it, ignoreCase = true) }) return true
    for (i in 0 until node.childCount) {
      if (nodeMentions(node.getChild(i), targets)) return true
    }
    return false
  }

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
