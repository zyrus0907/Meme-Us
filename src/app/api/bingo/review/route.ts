import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const photoId = typeof body.photo_id === "string" ? body.photo_id : "";
  const approved = body.approved;

  if (!photoId || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
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

  const { data: photo, error: photoError } = await admin
    .from("bingo_photos")
    .select("id, user_id, image_url, board_id")
    .eq("id", photoId)
    .maybeSingle();

  if (photoError || !photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const { data: board } = await admin
    .from("bingo_boards")
    .select("couple_id")
    .eq("id", photo.board_id)
    .maybeSingle();
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const { data: couple } = await admin
    .from("couples")
    .select("user_a, user_b, status")
    .eq("id", board.couple_id)
    .maybeSingle();

  const isMember =
    couple?.status === "linked" &&
    (couple.user_a === user.id || couple.user_b === user.id);
  const isPartnerPhoto = photo.user_id !== user.id;
  if (!isMember || !isPartnerPhoto) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  if (!approved) {
    const { error: voteDeleteError } = await admin
      .from("bingo_votes")
      .delete()
      .eq("photo_id", photoId);
    if (voteDeleteError) {
      return NextResponse.json({ error: "Could not reset review" }, { status: 500 });
    }

    const { error: photoDeleteError } = await admin
      .from("bingo_photos")
      .delete()
      .eq("id", photoId);
    if (photoDeleteError) {
      return NextResponse.json({ error: "Could not reset cell" }, { status: 500 });
    }

    // Storage cleanup is best-effort. The database row is already removed, so
    // the owner can immediately submit a replacement even if this fails.
    await admin.storage.from("memes").remove([photo.image_url]);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  const { data: existingVote } = await admin
    .from("bingo_votes")
    .select("id")
    .eq("photo_id", photoId)
    .eq("voter_id", user.id)
    .maybeSingle();

  const voteResult = existingVote
    ? await admin
        .from("bingo_votes")
        .update({ approved: true })
        .eq("id", existingVote.id)
    : await admin
        .from("bingo_votes")
        .insert({ photo_id: photoId, voter_id: user.id, approved: true });

  if (voteResult.error) {
    return NextResponse.json({ error: "Could not save review" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "approved" });
}
