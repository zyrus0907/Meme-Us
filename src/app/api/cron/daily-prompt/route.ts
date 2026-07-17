import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// This runs daily via Vercel cron (see vercel.json)
// 1. Tries Gemini AI to generate a fresh prompt
// 2. Falls back to the seed pool if AI fails
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().split("T")[0];

  // Already have today's prompt?
  const { data: existing } = await supabaseAdmin
    .from("daily_prompts")
    .select("id")
    .eq("prompt_date", today)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, prompt_id: existing.id, source: "existing" });
  }

  // Try Gemini AI first
  if (geminiKey) {
    try {
      const { data: recent } = await supabaseAdmin
        .from("daily_prompts")
        .select("title")
        .order("prompt_date", { ascending: false })
        .limit(14);

      const recentTitles = (recent || []).map((r: any) => r.title).join(", ");

      const systemPrompt = `You are a creative prompt generator for a couples' daily photo game. Generate ONE prompt.

Rules:
- Title: 2-5 punchy words
- Description: 1 sentence telling them what to photograph  
- Category: "meme" (70% of the time), "color" (15%), or "sentimental" (15%)
- Must be easy (everyday objects, no special equipment)
- Open to creative/funny interpretation

DO NOT repeat: ${recentTitles}

Respond ONLY with JSON: {"title":"...","description":"...","category":"meme"}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 1.0, maxOutputTokens: 200 },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const clean = text.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);
          if (parsed.title && parsed.description) {
            if (!["meme", "color", "sentimental"].includes(parsed.category)) {
              parsed.category = "meme";
            }
            const { data: inserted } = await supabaseAdmin
              .from("daily_prompts")
              .insert({ prompt_date: today, title: parsed.title, description: parsed.description, category: parsed.category })
              .select("id")
              .single();

            if (inserted) {
              return NextResponse.json({ ok: true, prompt_id: inserted.id, source: "gemini" });
            }
          }
        }
      }
    } catch (err) {
      console.error("Gemini failed, using pool:", err);
    }
  }

  // Fallback: seed pool
  const { data, error } = await supabaseAdmin.rpc("ensure_today_prompt");
  if (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, prompt_id: data, source: "pool" });
}
