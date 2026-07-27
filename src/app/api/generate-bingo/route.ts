import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getFreshFallbackPrompts,
  normalizeBingoPrompt,
  type BingoPromptSeed,
} from "@/lib/bingo-prompts";

interface BingoCell extends BingoPromptSeed {
  id: string;
}

function startOfCurrentUtcWeek() {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().split("T")[0];
}

function isUsablePrompt(value: unknown): value is BingoPromptSeed {
  if (!value || typeof value !== "object") return false;
  const prompt = value as Record<string, unknown>;
  return (
    typeof prompt.text === "string" &&
    prompt.text.trim().length >= 3 &&
    prompt.text.trim().length <= 48 &&
    typeof prompt.emoji === "string" &&
    prompt.emoji.trim().length > 0
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const coupleId = typeof body.couple_id === "string" ? body.couple_id : "";
  if (!coupleId) {
    return NextResponse.json({ error: "Missing couple_id" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: couple } = await admin
    .from("couples")
    .select("user_a, user_b, status")
    .eq("id", coupleId)
    .maybeSingle();
  if (
    !couple ||
    couple.status !== "linked" ||
    (couple.user_a !== user.id && couple.user_b !== user.id)
  ) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const weekStart = startOfCurrentUtcWeek();
  const { data: existing } = await admin
    .from("bingo_boards")
    .select("id, cells")
    .eq("couple_id", coupleId)
    .eq("week_start", weekStart)
    .maybeSingle();

  let refreshBoardId: string | null = null;
  if (existing) {
    const [{ count: photoCount }, { data: previousBoard }] = await Promise.all([
      admin
        .from("bingo_photos")
        .select("id", { count: "exact", head: true })
        .eq("board_id", existing.id),
      admin
        .from("bingo_boards")
        .select("cells")
        .eq("couple_id", coupleId)
        .lt("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const previousPrompts = new Set(
      (Array.isArray(previousBoard?.cells) ? previousBoard.cells : [])
        .filter((cell) => cell && typeof cell.text === "string")
        .map((cell) => normalizeBingoPrompt(cell.text)),
    );
    const repeatedCount = (
      Array.isArray(existing.cells) ? existing.cells : []
    ).filter(
      (cell) =>
        cell &&
        typeof cell.text === "string" &&
        previousPrompts.has(normalizeBingoPrompt(cell.text)),
    ).length;

    // Repair an already-created repetitive board immediately, but never
    // replace a board after either partner has started filling it.
    if ((photoCount || 0) === 0 && repeatedCount >= 3) {
      refreshBoardId = existing.id;
    } else {
      return NextResponse.json({
        ok: true,
        board_id: existing.id,
        source: "existing",
      });
    }
  }

  // Remember a full year of boards. Exact prompt reuse is prevented across
  // this history for both AI output and every fallback source.
  const { data: historicalBoards } = await admin
    .from("bingo_boards")
    .select("cells")
    .eq("couple_id", coupleId)
    .order("week_start", { ascending: false })
    .limit(52);

  const excluded = new Set<string>();
  for (const board of historicalBoards || []) {
    for (const cell of Array.isArray(board.cells) ? board.cells : []) {
      if (cell && typeof cell.text === "string") {
        excluded.add(normalizeBingoPrompt(cell.text));
      }
    }
  }

  const chosen: BingoPromptSeed[] = [];
  const addUnique = (prompts: unknown[]) => {
    for (const candidate of prompts) {
      if (!isUsablePrompt(candidate) || chosen.length >= 9) continue;
      const text = candidate.text.trim();
      const key = normalizeBingoPrompt(text);
      if (!key || excluded.has(key)) continue;
      excluded.add(key);
      chosen.push({ text, emoji: candidate.emoji.trim() });
    }
  };

  let usedAi = false;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const recentText = Array.from(excluded).slice(0, 180).join(" | ");
      const prompt = `Create photo-bingo prompts for two Gen Z partners.

Return exactly 14 different ideas as a JSON array:
[{"text":"2 to 6 words","emoji":"one emoji"}]

Rules:
- Every idea must be quick to photograph with a phone today.
- Mix objects, faces, colours, food, textures, outdoor finds, nostalgia, and absurd mini challenges.
- Make them specific, playful, and surprising. Avoid generic ideas like "something red" or "current view".
- Do not reuse or closely paraphrase this couple's previous prompts:
${recentText || "There are no previous prompts yet."}

Return JSON only.`;

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 1200,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof output === "string") {
          const parsed = JSON.parse(output.replace(/```json|```/g, "").trim());
          if (Array.isArray(parsed)) {
            const before = chosen.length;
            addUnique(parsed);
            usedAi = chosen.length > before;
          }
        }
      } else {
        console.error("Gemini bingo generation failed:", response.status);
      }
    } catch (error) {
      console.error("Gemini bingo generation failed:", error);
    }
  }

  if (chosen.length < 9) {
    const { data: databasePool } = await admin
      .from("bingo_prompts")
      .select("text, emoji")
      .limit(500);
    addUnique(databasePool || []);
  }

  if (chosen.length < 9) {
    addUnique(
      getFreshFallbackPrompts(
        excluded,
        `${coupleId}:${weekStart}`,
        9 - chosen.length,
      ),
    );
  }

  if (chosen.length < 9) {
    return NextResponse.json(
      { error: "Not enough fresh bingo prompts" },
      { status: 503 },
    );
  }

  const cells: BingoCell[] = chosen.slice(0, 9).map((cell, index) => ({
    id: `${weekStart}-${index}-${normalizeBingoPrompt(cell.text).replace(/ /g, "-")}`,
    ...cell,
  }));

  const boardWrite = refreshBoardId
    ? admin
        .from("bingo_boards")
        .update({ cells })
        .eq("id", refreshBoardId)
        .select("id")
        .single()
    : admin
        .from("bingo_boards")
        .insert({ couple_id: coupleId, week_start: weekStart, cells })
        .select("id")
        .single();
  const { data: board, error } = await boardWrite;

  if (error) {
    // A simultaneous request may have created the weekly board first.
    const { data: retry } = await admin
      .from("bingo_boards")
      .select("id")
      .eq("couple_id", coupleId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (retry) {
      return NextResponse.json({
        ok: true,
        board_id: retry.id,
        source: "race",
      });
    }
    console.error("Bingo board insert failed:", error);
    return NextResponse.json(
      { error: "Failed to create board" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    board_id: board.id,
    source: refreshBoardId
      ? "refreshed"
      : usedAi
        ? "gemini"
        : "fresh-pool",
  });
}
