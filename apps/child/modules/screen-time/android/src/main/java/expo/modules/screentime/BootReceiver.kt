package expo.modules.screentime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Relaunches the app after a reboot so the location heartbeat resumes (the JS
 * side calls ensureTracking() on launch). Best-effort: modern Android / OEMs
 * (MIUI) may block background activity starts unless the app was opened once
 * and Autostart is enabled. The server-side offline alert is the safety net.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action == Intent.ACTION_BOOT_COMPLETED ||
      action == "android.intent.action.QUICKBOOT_POWERON" ||
      action == "android.intent.action.LOCKED_BOOT_COMPLETED"
    ) {
      try {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launch != null) {
          launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(launch)
        }
      } catch (e: Exception) {
        // ignored — OEM blocked the background start
      }
    }
  }
}
