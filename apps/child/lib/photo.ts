import { PermissionsAndroid, Platform } from "react-native";
import { scanPhotoPrivacy } from "../modules/screen-time";
import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";

/**
 * Transparent, on-device photo-privacy check: the OS permission dialog is the
 * consent. We read ONLY EXIF metadata (is there a GPS tag?) and report counts.
 * No image content is ever read or uploaded.
 */
export async function scanAndReportPhotos(): Promise<void> {
  try {
    if (Platform.OS !== "android") return;
    const childId = await getStoredChildId();
    if (!childId) return;

    const perm =
      typeof Platform.Version === "number" && Platform.Version >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
    const granted = await PermissionsAndroid.request(perm);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;

    const { total, geotagged } = await scanPhotoPrivacy();
    await supabase.rpc("report_photo_privacy", {
      p_child: childId,
      p_total: total,
      p_geo: geotagged,
    });
  } catch (e: any) {
    console.warn("scanAndReportPhotos failed", e?.message);
  }
}
