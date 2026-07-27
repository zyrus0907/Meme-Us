import { Capacitor } from "@capacitor/core";
import {
  Camera,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function pickNativePhoto(source: "camera" | "library") {
  if (!isNativeApp()) return null;

  const photo = await Camera.getPhoto({
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    resultType: CameraResultType.DataUrl,
    quality: 90,
    width: 1080,
    height: 1080,
    correctOrientation: true,
    allowEditing: false,
  });

  return photo.dataUrl ?? null;
}

export async function nativeSuccessHaptic() {
  if (!isNativeApp()) return;
  await Haptics.impact({ style: ImpactStyle.Medium });
}

export function isNativeCancellation(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|canceled|cancelled|no image picked/i.test(message);
}
