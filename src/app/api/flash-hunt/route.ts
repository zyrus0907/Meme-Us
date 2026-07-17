import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/flash-hunt — triggers a new flash hunt for all linked couples
// Called by Vercel cron or manually for testing
// GET /api/flash-hunt?couple_id=xxx — trigger for a specific couple (for testing)
export async function GET(request: NextRequest) {
  return handleTrigger(request);
}

export async function POST(request: NextRequest) {
  return handleTrigger(request);
}

async function handleTrigger(request: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(request.url);
  const specificCouple = url.searchParams.get("couple_id");

  // If not manually triggered, randomly skip (50% chance) to keep it unpredictable
  if (!specificCouple && Math.random() > 0.5) {
    return NextResponse.json({ ok: true, skipped: true, reason: "random_skip" });
  }

  // Generate prompt — try AI first, fallback to seed pool
  let prompt: { text: string; emoji: string } | null = null;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      // Get recent flash prompts to avoid repeats
      const { data: recentHunts } = await admin
        .from("flash_hunts")
        .select("prompt_text")
        .order("created_at", { ascending: false })
        .limit(10);
      const recentTexts = (recentHunts || []).map((h: any) => h.prompt_text).join(", ");

      const aiPrompt = `Generate ONE flash hunt challenge for a couples' photo game. The challenge must be something they can find and photograph within 10 minutes.

Categories (pick one randomly):
- Find an object of a specific color (e.g. "Find something RED")
- Find a specific texture (e.g. "Something SHINY")
- Find a category of object (e.g. "A drink", "Something round")
- Make a funny face (e.g. "Make a RAT face 🐀", "Your best FISH face")
- Express an emotion (e.g. "Look DISGUSTED", "Pretend you won the lottery")
- Absurd challenges (e.g. "The UGLIEST thing in sight", "Something you'd NEVER eat")

Rules:
- Keep it SHORT (2-6 words)
- Must be doable ANYWHERE (home, work, outside)
- Include one relevant emoji
- Make it fun and slightly absurd
- Mix between finding objects AND making faces/expressions

${recentTexts ? `DO NOT repeat: ${recentTexts}` : ""}

Respond ONLY with JSON: {"text":"Find something RED","emoji":"🔴"}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: aiPrompt }] }],
            generationConfig: { temperature: 1.2, maxOutputTokens: 100 },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const clean = text.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);
          if (parsed.text && parsed.emoji) {
            prompt = { text: parsed.text, emoji: parsed.emoji };
          }
        }
      }
    } catch (err) {
      console.error("Gemini flash hunt generation failed:", err);
    }
  }

  // Fallback: random from seed pool
  if (!prompt) {
    const { data: prompts } = await admin.from("flash_prompts").select("*").limit(100);
    if (!prompts || prompts.length === 0) {
      return NextResponse.json({ error: "No flash prompts" }, { status: 500 });
    }
    const p = prompts[Math.floor(Math.random() * prompts.length)];
    prompt = { text: p.text, emoji: p.emoji };
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  // Get couples to send to
  let couples: any[] = [];
  if (specificCouple) {
    const { data } = await admin.from("couples").select("*").eq("id", specificCouple).eq("status", "linked");
    couples = data || [];
  } else {
    // All linked couples — in production you'd want to randomize which couples get it
    // For MVP, send to all linked couples
    const { data } = await admin.from("couples").select("*").eq("status", "linked");
    couples = data || [];
  }

  let created = 0;

  for (const couple of couples) {
    // Check they don't already have an active hunt
    const { data: active } = await admin
      .from("flash_hunts")
      .select("id")
      .eq("couple_id", couple.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (active) continue; // Skip, they already have one

    // Create the hunt
    const { error } = await admin.from("flash_hunts").insert({
      couple_id: couple.id,
      prompt_text: prompt.text,
      prompt_emoji: prompt.emoji,
      expires_at: expiresAt,
    });

    if (error) { console.error("Flash hunt insert error:", error); continue; }
    created++;

    // Send push to both partners
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPrivateKey || !vapidPublicKey) continue;

    let webpush: any;
    try { webpush = await import("web-push"); } catch { continue; }
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || "mailto:hello@memeus.app",
      vapidPublicKey, vapidPrivateKey
    );

    const payload = JSON.stringify({
      title: `⚡ FLASH HUNT: ${prompt.emoji} ${prompt.text}`,
      body: "10 minutes — GO! First to submit wins!",
      url: "/flash-hunt",
      tag: "flash-hunt",
    });

    for (const uid of [couple.user_a, couple.user_b]) {
      if (!uid) continue;
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", uid);

      for (const sub of (subs || [])) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await admin.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, created, prompt: prompt.text });
}
