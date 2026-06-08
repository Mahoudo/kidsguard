package expo.modules.screentime

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * Device-admin receiver. Being an active admin means the child must first
 * deactivate it (an extra, explained step) before the app can be uninstalled.
 * onDisableRequested lets us warn the child at that moment.
 */
class KidsGuardAdminReceiver : DeviceAdminReceiver() {
  override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
    return "KidsGuard protège ce téléphone. Désactiver le contrôle parental " +
      "préviendra immédiatement tes parents."
  }
}
