package expo.modules.screentime

import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Calendar

class ScreenTimeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenTime")

    // Is PACKAGE_USAGE_STATS special access granted?
    Function("hasUsagePermission") {
      val ctx = appContext.reactContext ?: return@Function false
      val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        ctx.packageName
      )
      mode == AppOpsManager.MODE_ALLOWED
    }

    // Send the user to the system screen to grant usage access.
    Function("openUsageAccessSettings") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
      }
    }

    // Per-app foreground time since local midnight.
    AsyncFunction("getUsageToday") {
      val ctx = appContext.reactContext
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

      val cal = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      val start = cal.timeInMillis
      val end = System.currentTimeMillis()

      val pm = ctx.packageManager
      val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end)

      stats
        .filter { it.totalTimeInForeground > 0 }
        .map { s ->
          val label = try {
            pm.getApplicationLabel(pm.getApplicationInfo(s.packageName, 0)).toString()
          } catch (e: Exception) {
            s.packageName
          }
          mapOf(
            "packageName" to s.packageName,
            "appName" to label,
            "totalMs" to s.totalTimeInForeground
          )
        }
        .sortedByDescending { it["totalMs"] as Long }
    }

    // Is the KidsGuard accessibility service (app blocker) enabled?
    Function("isAccessibilityEnabled") {
      val ctx = appContext.reactContext ?: return@Function false
      val target = ctx.packageName + "/" + AppBlockerService::class.java.name
      val enabled = Settings.Secure.getString(
        ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
      ) ?: ""
      enabled.split(":").any { it.equals(target, ignoreCase = true) }
    }

    // Open the accessibility settings screen so the user can enable the blocker.
    Function("openAccessibilitySettings") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
      }
    }

    // Is KidsGuard an active device admin? (blocks casual uninstall)
    Function("isAdminActive") {
      val ctx = appContext.reactContext ?: return@Function false
      val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
      dpm.isAdminActive(ComponentName(ctx, KidsGuardAdminReceiver::class.java))
    }

    // Prompt the user to grant device-admin (anti-uninstall protection).
    Function("requestAdmin") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        val comp = ComponentName(ctx, KidsGuardAdminReceiver::class.java)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
          putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, comp)
          putExtra(
            DevicePolicyManager.EXTRA_ADD_EXPLANATION,
            "Active la protection KidsGuard pour empêcher la désinstallation."
          )
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
      }
    }

    // Is the app exempt from battery optimization? (needed to stay alive in bg)
    Function("isBatteryUnrestricted") {
      val ctx = appContext.reactContext ?: return@Function false
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    // Prompt the user to exempt KidsGuard from battery optimization.
    Function("requestDisableBatteryOptimization") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = Uri.parse("package:" + ctx.packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
      }
    }

    // Persist block rules for the accessibility service to enforce.
    Function("setBlockRules") {
      packages: List<String>,
      studyEnabled: Boolean, studyStart: String?, studyEnd: String?,
      sleepEnabled: Boolean, sleepStart: String?, sleepEnd: String?,
      locked: Boolean ->
      val ctx = appContext.reactContext
      if (ctx != null) {
        ctx.getSharedPreferences("kidsguard_block", Context.MODE_PRIVATE).edit()
          .putStringSet("blocked", packages.toSet())
          .putBoolean("studyEnabled", studyEnabled)
          .putString("studyStart", studyStart)
          .putString("studyEnd", studyEnd)
          .putBoolean("sleepEnabled", sleepEnabled)
          .putString("sleepStart", sleepStart)
          .putString("sleepEnd", sleepEnd)
          .putBoolean("locked", locked)
          .apply()
      }
    }
  }
}
