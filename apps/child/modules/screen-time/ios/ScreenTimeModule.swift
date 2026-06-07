import ExpoModulesCore

// iOS screen-time uses the FamilyControls / DeviceActivity frameworks, which
// require Apple's "Family Controls" entitlement (request via Apple Developer).
// Until that entitlement is granted, these are stubs so the JS API stays
// stable cross-platform. Real implementation (Phase 4-iOS):
//   - AuthorizationCenter.shared.requestAuthorization(for: .child)
//   - DeviceActivityReport extension to surface usage
//   - ManagedSettingsStore to shield/block apps
public class ScreenTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScreenTime")

    Function("hasUsagePermission") { () -> Bool in
      return false
    }

    Function("openUsageAccessSettings") {
      // No direct settings deep-link; handled via FamilyControls auth flow.
    }

    AsyncFunction("getUsageToday") { () -> [[String: Any]] in
      return []
    }
  }
}
