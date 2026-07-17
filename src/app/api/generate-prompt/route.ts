import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/generate-prompt
// Generates a creative daily prompt using Gemini AI
// Falls back to the seed pool if AI fails
export async function POST() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if today already has a prompt
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabaseAdmin
    .from("daily_prompts")
    .select("id")
    .eq("prompt_date", today)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, prompt_id: existing.id, source: "existing" });
  }

  // Try AI generation first
  if (geminiKey) {
    try {
      const prompt = await generateWithGemini(geminiKey, supabaseAdmin);
      if (prompt) {
        const { data, error } = await supabaseAdmin
          .from("daily_prompts")
          .insert({
            prompt_date: today,
            title: prompt.title,
            description: prompt.description,
            category: prompt.category,
          })
          .select("id")
          .single();

        if (!error && data) {
          return NextResponse.json({ ok: true, prompt_id: data.id, source: "gemini" });
        }
      }
    } catch (err) {
      console.error("Gemini generation failed, falling back to pool:", err);
    }
  }

  // Fallback: use the seed pool
  const { data: fallback } = await supabaseAdmin.rpc("ensure_today_prompt");
  return NextResponse.json({ ok: true, prompt_id: fallback, source: "pool" });
}

async function generateWithGemini(
  apiKey: string,
  supabase: any
): Promise<{ title: string; description: string; category: string } | null> {
  // Get recent prompts to avoid repetition
  const { data: recent } = await supabase
    .from("daily_prompts")
    .select("title")
    .order("prompt_date", { ascending: false })
    .limit(14);

  const recentTitles = (recent || []).map((r: any) => r.title).join(", ");

  const systemPrompt = `You are a creative prompt generator for a couples' daily photo game called "Meme Us". 

The game works like this: both partners get the same prompt, take a funny photo of something in their life that matches it, add meme text, and then do a blind reveal where they see each other's photos side by side.

Generate ONE new prompt. It must be:
- Short title (2-5 words, punchy, funny)
- A description (1 sentence, telling them what to photograph)
- Category: either "meme" (funny/sarcastic), "color" (find something of a specific color), or "sentimental" (sweet/romantic)

Most prompts should be "meme" category (70%), with occasional "color" (15%) and "sentimental" (15%).

The prompt should be about everyday objects and situations. It should be EASY to do (no special equipment or locations needed) but open to creative interpretation. The humor comes from what people choose to photograph and the meme text they add.

Good examples:
- Title: "Corporate Despair" | Description: "Photograph an everyday object that perfectly captures a Monday morning mood." | Category: meme
- Title: "The Audacity" | Description: "Something that has NO right behaving the way it is." | Category: meme  
- Title: "Find the reddest thing near you" | Description: "Maximum red. No excuses, no orange impostors." | Category: color
- Title: "Something that reminded me of you" | Description: "Photograph the thing that made you think of them today." | Category: sentimental

DO NOT repeat these recent prompts: ${recentTitles}

Respond with ONLY valid JSON, no markdown, no backticks:
{"title": "...", "description": "...", "category": "meme"}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 200,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("Gemini API error:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  // Parse JSON from response (strip any markdown fences)
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  // Validate
  if (!parsed.title || !parsed.description || !parsed.category) return null;
  if (!["meme", "color", "sentimental"].includes(parsed.category)) {
    parsed.category = "meme";
  }

  return parsed;
}
