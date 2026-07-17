import { createClient } from "@/lib/supabase/client";

// Your VAPID public key — generate with: npx web-push generate-vapid-keys
// Put the public key here, private key in .env.local as VAPID_PRIVATE_KEY
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerPushNotifications(): Promise<boolean> {
  // Check support
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("Push notifications not supported");
    return false;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.log("VAPID public key not set");
    return false;
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Check permission
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return false;
    }

    // Subscribe to push
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
      });
    }

    // Save to database
    const sub = subscription.toJSON();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint!,
        p256dh: sub.keys!.p256dh!,
        auth: sub.keys!.auth!,
      },
      { onConflict: "user_id,endpoint" }
    );

    console.log("Push notifications registered");
    return true;
  } catch (err) {
    console.error("Push registration failed:", err);
    return false;
  }
}
