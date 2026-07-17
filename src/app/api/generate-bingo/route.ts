import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/generate-bingo
// Generates 9 fresh micro-prompts for a weekly bingo board
// Falls back to random picks from the seed pool if AI fails
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const coupleId = body.couple_id;

  if (!coupleId) {
    return NextResponse.json({ error: "Missing couple_id" }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Calculate this week's Monday
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  const weekStart = monday.toISOString().split("T")[0];

  // Check if board already exists
  const { data: existing } = await supabaseAdmin
    .from("bingo_boards")
    .select("id")
    .eq("couple_id", coupleId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, board_id: existing.id, source: "existing" });
  }

  let cells = null;

  // Try Gemini AI
  if (geminiKey) {
    try {
      // Get recent bingo prompts to avoid repeats
      const { data: recentBoards } = await supabaseAdmin
        .from("bingo_boards")
        .select("cells")
        .eq("couple_id", coupleId)
        .order("week_start", { ascending: false })
        .limit(3);

      const recentPrompts = (recentBoards || [])
        .flatMap((b: any) => (b.cells || []).map((c: any) => c.text))
        .join(", ");

      const prompt = `You generate micro-prompts for a couples' photo bingo game. Each prompt tells someone to find and photograph something OR make a funny face/expression.

Generate exactly 9 unique micro-prompts. Each must be:
- Very short (2-6 words)
- Easy to do with a phone camera anywhere
- Fun, quirky, or slightly absurd
- Paired with a single relevant emoji

Mix these types (use at least 3 different types):
- Objects: find something nearby ("Your worst mug", "Something suspicious")
- Colors: find a specific color ("Something red", "The brightest thing near you")  
- Faces: make a funny expression ("Your best fish face", "Look disgusted")
- Textures: find a texture ("Something shiny", "Something fluffy")
- Food: anything food-related ("A food crime", "Your saddest meal")
- Absurd: weird challenges ("The ugliest thing in sight", "Something that doesn't belong")

${recentPrompts ? `DO NOT repeat any of these: ${recentPrompts}` : ""}

Good examples:
- "Something red you own" 🔴
- "Your worst mug" ☕
- "A food crime" 🍕
- "The oldest thing near you" 🏺
- "Something suspicious" 👀

Respond ONLY with a JSON array, no markdown:
[{"text":"...","emoji":"🔴"},{"text":"...","emoji":"☕"}]
Exactly 9 items.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 1.1, maxOutputTokens: 500 },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const clean = text.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);
          if (Array.isArray(parsed) && parsed.length >= 9) {
            cells = parsed.slice(0, 9).map((p: any, i: number) => ({
              id: `ai-${weekStart}-${i}`,
              text: p.text || "Take a photo",
              emoji: p.emoji || "📸",
            }));
          }
        }
      }
    } catch (err) {
      console.error("Gemini bingo generation failed:", err);
    }
  }

  // Fallback: random from seed pool
  if (!cells) {
    const { data: pool } = await supabaseAdmin
      .from("bingo_prompts")
      .select("id, text, emoji")
      .limit(100);

    if (pool && pool.length >= 9) {
      // Shuffle and pick 9
      const shuffled = pool.sort(() => Math.random() - 0.5);
      cells = shuffled.slice(0, 9);
    } else {
      // Hardcoded emergency fallback
      cells = [
        { id: "d1", text: "Something red", emoji: "🔴" },
        { id: "d2", text: "Your worst mug", emoji: "☕" },
        { id: "d3", text: "Proof you went outside", emoji: "🌳" },
        { id: "d4", text: "A food crime", emoji: "🍕" },
        { id: "d5", text: "The oldest thing near you", emoji: "🏺" },
        { id: "d6", text: "Something suspicious", emoji: "👀" },
        { id: "d7", text: "A tiny thing", emoji: "🐜" },
        { id: "d8", text: "Something cozy", emoji: "🧸" },
        { id: "d9", text: "Your current view", emoji: "🪟" },
      ];
    }
  }

  // Create the board
  const { data: board, error } = await supabaseAdmin
    .from("bingo_boards")
    .insert({
      couple_id: coupleId,
      week_start: weekStart,
      cells,
    })
    .select("id")
    .single();

  if (error) {
    // Might be a race condition — board was just created
    const { data: retry } = await supabaseAdmin
      .from("bingo_boards")
      .select("id")
      .eq("couple_id", coupleId)
      .eq("week_start", weekStart)
      .single();

    if (retry) {
      return NextResponse.json({ ok: true, board_id: retry.id, source: "race" });
    }
    return NextResponse.json({ error: "Failed to create board" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    board_id: board.id,
    source: cells[0]?.id?.startsWith("ai-") ? "gemini" : "pool",
  });
}
