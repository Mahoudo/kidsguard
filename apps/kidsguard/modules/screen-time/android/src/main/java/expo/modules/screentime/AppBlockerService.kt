package expo.modules.screentime

import android.accessibilityservice.AccessibilityService
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
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

  private var overlay: View? = null
  private var lastPkg: String = ""
  private var watching = false
  private val handler = Handler(Looper.getMainLooper())

  // While locked, keep checking (independently of window events, so an UNLOCK is
  // detected even if no app switch happens) and keep the opaque lock surface up
  // over every app except KidsGuard itself (so its pause screen + SOS stay usable).
  private val lockWatcher = object : Runnable {
    override fun run() {
      val locked = getSharedPreferences("kidsguard_block", Context.MODE_PRIVATE)
        .getBoolean("locked", false)
      if (!locked) { hideLockOverlay(); watching = false; return }
      if (lastPkg == packageName) hideLockOverlay() else showLockOverlay()
      handler.postDelayed(this, 1200)
    }
  }

  private fun ensureWatching() {
    if (watching) return
    watching = true
    handler.post(lockWatcher)
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    ensureWatching() // re-arm if we (re)connect while already locked
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    lastPkg = pkg
    if (pkg == packageName) { ensureWatching(); return }

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
    Log.d("KGBlock", "evt pkg=$pkg locked=$locked blockedN=${blocked.size}")

    // When locked: cover the foreground app with an opaque accessibility overlay
    // (works without a PIN and without background-activity-launch). The watcher
    // keeps it up and removes it on unlock; lockDevice() additionally engages the
    // real keyguard on PIN-protected devices.
    if (locked) {
      ensureWatching()
      showLockOverlay()
      lockDevice()
    } else if (inFocusWindow(prefs) || blocked.contains(pkg)) {
      performGlobalAction(GLOBAL_ACTION_HOME)
    }
  }

  override fun onInterrupt() {}

  override fun onUnbind(intent: Intent?): Boolean {
    hideLockOverlay()
    handler.removeCallbacks(lockWatcher)
    watching = false
    return super.onUnbind(intent)
  }

  // Full-screen opaque lock surface. Tapping it opens KidsGuard so the child can
  // still reach the SOS button. TYPE_ACCESSIBILITY_OVERLAY needs no extra
  // permission (the accessibility service grants it) and sits above every app.
  private fun showLockOverlay() {
    if (overlay != null) return
    try {
      val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val root = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(48, 48, 48, 48)
        setBackgroundColor(Color.parseColor("#FFF6F0"))
        isClickable = true
        setOnClickListener { launchKidsGuard() }
      }
      root.addView(TextView(this).apply { text = "🦁"; textSize = 64f; gravity = Gravity.CENTER })
      root.addView(TextView(this).apply {
        text = "Téléphone en pause"
        setTextColor(Color.parseColor("#16132E"))
        textSize = 26f
        gravity = Gravity.CENTER
        setPadding(0, 24, 0, 8)
      })
      root.addView(TextView(this).apply {
        text = "Tes parents l'ont mis en pause.\nAppuie ici en cas d'urgence (SOS)."
        setTextColor(Color.parseColor("#7C7896"))
        textSize = 15f
        gravity = Gravity.CENTER
      })
      val lp = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.OPAQUE
      )
      wm.addView(root, lp)
      overlay = root
    } catch (e: Exception) {
      Log.d("KGBlock", "overlay add failed: ${e.message}")
    }
  }

  private fun hideLockOverlay() {
    val o = overlay ?: return
    overlay = null
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(o)
    } catch (e: Exception) {}
  }

  private fun lockDevice(): Boolean {
    return try {
      val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
      val comp = ComponentName(this, KidsGuardAdminReceiver::class.java)
      if (dpm.isAdminActive(comp)) {
        dpm.lockNow()
        true
      } else false
    } catch (e: Exception) {
      false
    }
  }

  private fun launchKidsGuard() {
    try {
      val intent = packageManager.getLaunchIntentForPackage(packageName)
      if (intent != null) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
      } else {
        performGlobalAction(GLOBAL_ACTION_HOME)
      }
    } catch (e: Exception) {
      performGlobalAction(GLOBAL_ACTION_HOME)
    }
  }

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
