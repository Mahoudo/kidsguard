import { requireOptionalNativeModule } from "expo-modules-core";

// Optional: returns null if the native module isn't present in the build
// (instead of throwing at import, which would crash the whole app).
export default requireOptionalNativeModule("ScreenTime");
