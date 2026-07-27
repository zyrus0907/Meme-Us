import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// Web Push - we use the web standard fetch-based approach
// Install: npm install web-push
// For now we use a lightweight approach that works without the library

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { partner_id, title, message, url } = body;

    if (!partner_id || !title || !message) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (typeof title !== "string" || typeof message !== "string" || title.length > 80 || message.length > 240) {
      return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
    }

    // Verify the caller is authenticated
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(c: any) { try { c.forEach(({ name, value, options }: any) => cookieStore.set(name, value, options)); } catch {} },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Use service role to read partner's push subscriptions
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: couple } = await admin
      .from("couples")
      .select("user_a, user_b, status")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .eq("status", "linked")
      .maybeSingle();
    const actualPartnerId = couple?.user_a === user.id ? couple.user_b : couple?.user_a;
    if (!couple || actualPartnerId !== partner_id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", partner_id);

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "no_subscriptions" });
    }

    // Send push to each subscription
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || "mailto:hello@memeus.app";

    if (!vapidPrivateKey || !vapidPublicKey) {
      return NextResponse.json({ ok: true, sent: 0, reason: "vapid_not_configured" });
    }

    // Dynamic import web-push (server-side only)
    let webpush: any;
    try {
      webpush = await import("web-push");
    } catch {
      return NextResponse.json({ ok: true, sent: 0, reason: "web-push_not_installed" });
    }

    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title,
      body: message,
      url: typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/today",
      tag: "partner-submitted",
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (err: any) {
        // If subscription expired, clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
        console.error("Push send failed:", err.statusCode || err.message);
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err: any) {
    console.error("Push API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
