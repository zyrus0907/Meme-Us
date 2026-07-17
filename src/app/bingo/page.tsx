"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface CellPrompt { id: string; text: string; emoji: string; }
interface BingoPhoto { id: string; board_id: string; cell_index: number; user_id: string; image_url: string; created_at: string; }
interface BingoVote { id: string; photo_id: string; voter_id: string; approved: boolean; }

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

export default function BingoPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState("Partner");
  const [myName, setMyName] = useState("You");
  const [boardId, setBoardId] = useState<string | null>(null);
  const [cells, setCells] = useState<CellPrompt[]>([]);
  const [photos, setPhotos] = useState<BingoPhoto[]>([]);
  const [votes, setVotes] = useState<BingoVote[]>([]);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingCell, setViewingCell] = useState<number | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "partner">("mine");

  const router = useRouter();
  const supabase = createClient();

  const loadBoard = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setUserId(user.id);

    const { data: c } = await supabase.from("couples").select("*").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).eq("status", "linked").maybeSingle();
    if (!c) { router.replace("/onboarding"); return; }
    setCoupleId(c.id);

    const pid = c.user_a === user.id ? c.user_b : c.user_a;
    setPartnerId(pid);
    const { data: myProf } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
    const { data: pp } = await supabase.from("profiles").select("display_name").eq("id", pid).single();
    setPartnerName(pp?.display_name || "Partner");
    setMyName(myProf?.display_name || "You");

    let bid: string | null = null;
    try {
      const res = await fetch("/api/generate-bingo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ couple_id: c.id }) });
      const result = await res.json();
      bid = result.board_id || null;
    } catch {
      const { data } = await supabase.rpc("ensure_bingo_board", { cid: c.id });
      bid = data;
    }
    if (!bid) { toast.error("Couldn't load bingo board"); return; }
    setBoardId(bid);

    const { data: board } = await supabase.from("bingo_boards").select("*").eq("id", bid).single();
    if (board) setCells(board.cells as CellPrompt[]);

    const { data: ph } = await supabase.from("bingo_photos").select("*").eq("board_id", bid);
    setPhotos(ph || []);

    if (ph && ph.length > 0) {
      const { data: v } = await supabase.from("bingo_votes").select("*").in("photo_id", ph.map((p: any) => p.id));
      setVotes(v || []);
    }

    setLoading(false);
  };

  useEffect(() => { loadBoard(); }, []);

  useEffect(() => {
    if (!boardId) return;
    const ch = supabase.channel(`bingo-${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bingo_photos", filter: `board_id=eq.${boardId}` }, () => loadBoard())
      .on("postgres_changes", { event: "*", schema: "public", table: "bingo_votes" }, () => loadBoard())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [boardId]);

  // Get cell status for a specific user
  const getCellStatus = (index: number, uid: string) => {
    const photo = photos.find(p => p.cell_index === index && p.user_id === uid);
    if (!photo) return "empty";
    const vote = votes.find(v => v.photo_id === photo.id);
    if (vote?.approved === true) return "approved";
    if (vote?.approved === false) return "rejected";
    return "pending"; // submitted but not reviewed yet
  };

  // Count approved cells
  const countApproved = (uid: string) => {
    return Array.from({ length: 9 }, (_, i) => getCellStatus(i, uid)).filter(s => s === "approved").length;
  };

  const countFilled = (uid: string) => {
    return photos.filter(p => p.user_id === uid).length;
  };

  // Check bingo for a user
  const hasBingo = (uid: string): number[] | null => {
    for (const line of LINES) {
      if (line.every(i => getCellStatus(i, uid) === "approved")) return line;
    }
    return null;
  };

  // Upload photo for a cell
  const handleUpload = (cellIndex: number) => {
    if (!boardId || !userId || !coupleId) return;
    const existing = photos.find(p => p.cell_index === cellIndex && p.user_id === userId);
    if (existing) { toast("You already filled this cell"); return; }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(true);

      try {
        // Compress the image first to handle flash photos
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        const maxSize = 720;
        const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
        canvas.width = bitmap.width * scale;
        canvas.height = bitmap.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        // Square crop
        const sq = document.createElement("canvas");
        const cropSize = Math.min(canvas.width, canvas.height);
        sq.width = cropSize;
        sq.height = cropSize;
        const sqCtx = sq.getContext("2d")!;
        sqCtx.drawImage(canvas, (canvas.width - cropSize) / 2, (canvas.height - cropSize) / 2, cropSize, cropSize, 0, 0, cropSize, cropSize);

        const blob = await new Promise<Blob>((res, rej) => {
          sq.toBlob(b => b ? res(b) : rej(new Error("blob failed")), "image/jpeg", 0.75);
        });

        const filePath = `${coupleId}/bingo/${boardId}/${cellIndex}_${userId}.jpg`;
        const { error: upErr } = await supabase.storage.from("memes").upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from("bingo_photos").insert({ board_id: boardId, cell_index: cellIndex, user_id: userId, image_url: filePath });
        if (insErr) throw insErr;

        toast.success("Photo added! 📸");

        // Notify partner
        if (partnerId) {
          fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partner_id: partnerId, title: "Bingo! 🎲 New photo to review", message: `${myName} filled a cell — approve or reject it!`, url: "/bingo" })
          }).catch(() => {});
        }

        await loadBoard();
      } catch (err: any) {
        console.error("Upload error:", err);
        toast.error("Upload failed. Try again.");
      }
      setUploading(false);
    };
    input.click();
  };

  // Vote
  const handleVote = async (photoId: string, approved: boolean) => {
    if (!userId) return;

    if (!approved) {
      // Delete the vote, the photo, and the storage file — cell goes back to empty
      await supabase.from("bingo_votes").delete().eq("photo_id", photoId);
      const photo = photos.find(p => p.id === photoId);
      if (photo) {
        await supabase.from("bingo_photos").delete().eq("id", photoId);
        await supabase.storage.from("memes").remove([photo.image_url]).catch(() => {});
      }
      toast("Rejected — they need to retake 😤");
    } else {
      const existing = votes.find(v => v.photo_id === photoId && v.voter_id === userId);
      if (existing) {
        await supabase.from("bingo_votes").update({ approved: true }).eq("id", existing.id);
      } else {
        await supabase.from("bingo_votes").insert({ photo_id: photoId, voter_id: userId, approved: true });
      }
      toast.success("Approved! ✅");
    }
    setViewingCell(null);
    await loadBoard();
  };

  // Load signed URL for a photo
  const loadSignedUrl = async (photo: BingoPhoto) => {
    const { data } = await supabase.storage.from("memes").createSignedUrl(photo.image_url, 3600);
    return data?.signedUrl || null;
  };

  const statusColor: Record<string, { bg: string; border: string; badge: string }> = {
    empty:    { bg: "#fff",    border: "#241B4D", badge: "" },
    pending:  { bg: "#EFEAFF", border: "#6C5CE7", badge: "⏳" },
    approved: { bg: "#E4F8EE", border: "#2FC98C", badge: "✅" },
    rejected: { bg: "#FFE9F0", border: "#FF5C8A", badge: "❌" },
  };

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-float" style={{ fontSize: 48 }}>🎲</span></div>;

  const myBingo = userId ? hasBingo(userId) : null;
  const partnerBingo = partnerId ? hasBingo(partnerId) : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 8px", flexShrink: 0 }}>
        <button onClick={() => router.back()} className="sticker-sm" style={{ padding: 10, background: "#fff", borderRadius: 14, display: "flex", cursor: "pointer" }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#241B4D", margin: 0 }}>Bingo 🎲</h1>
          <p style={{ fontSize: 12, color: "#8A84A3", margin: 0 }}>This week · race mode</p>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ padding: "4px 20px 10px", display: "flex", gap: 8 }}>
        <div className="sticker-pill" style={{ flex: 1, background: "#E4F8EE", padding: "6px 14px", textAlign: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#2FC98C" }}>🫠 {myName}: {countApproved(userId!)}✅ / {countFilled(userId!)} filled</span>
        </div>
        <div className="sticker-pill" style={{ flex: 1, background: "#FFE9F0", padding: "6px 14px", textAlign: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#FF5C8A" }}>💕 {partnerName}: {countApproved(partnerId!)}✅ / {countFilled(partnerId!)} filled</span>
        </div>
      </div>

      {/* Tab toggle — My grid vs Partner's grid */}
      <div style={{ padding: "0 20px 10px", display: "flex", gap: 8 }}>
        <button onClick={() => setTab("mine")} className="font-display" style={{ flex: 1, padding: "10px", fontSize: 14, fontWeight: 700, borderRadius: 14, border: "2px solid #241B4D", boxShadow: tab === "mine" ? "3px 3px 0 #241B4D" : "1px 1px 0 #241B4D", background: tab === "mine" ? "#6C5CE7" : "#fff", color: tab === "mine" ? "#fff" : "#241B4D", cursor: "pointer" }}>
          🫠 My Grid
        </button>
        <button onClick={() => setTab("partner")} className="font-display" style={{ flex: 1, padding: "10px", fontSize: 14, fontWeight: 700, borderRadius: 14, border: "2px solid #241B4D", boxShadow: tab === "partner" ? "3px 3px 0 #241B4D" : "1px 1px 0 #241B4D", background: tab === "partner" ? "#FF5C8A" : "#fff", color: tab === "partner" ? "#fff" : "#241B4D", cursor: "pointer" }}>
          💕 {partnerName}&apos;s Grid
        </button>
      </div>

      {/* Scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 32px" }} className="no-bar">

        {/* Bingo winner banner */}
        {myBingo && (
          <div className="sticker animate-pop-in" style={{ background: "#F5B301", padding: 18, textAlign: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 36 }}>🏆</span>
            <p className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#241B4D", margin: "6px 0 0" }}>You got BINGO!</p>
          </div>
        )}
        {partnerBingo && !myBingo && (
          <div className="sticker animate-pop-in" style={{ background: "#FFE9F0", padding: 18, textAlign: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 36 }}>😤</span>
            <p className="font-display" style={{ fontSize: 18, fontWeight: 700, color: "#241B4D", margin: "6px 0 0" }}>{partnerName} got BINGO first!</p>
            <p style={{ fontSize: 13, color: "#8A84A3", marginTop: 4 }}>Keep going for blackout — fill all 9!</p>
          </div>
        )}

        {/* The 3x3 Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {cells.map((cell, i) => {
            const viewUid = tab === "mine" ? userId! : partnerId!;
            const status = getCellStatus(i, viewUid);
            const sc = statusColor[status] || statusColor.empty;
            const isWinningCell = (tab === "mine" && myBingo?.includes(i)) || (tab === "partner" && partnerBingo?.includes(i));
            const photo = photos.find(p => p.cell_index === i && p.user_id === viewUid);

            // On partner tab: show cells that need review
            const needsReview = tab === "partner" && photo && !votes.find(v => v.photo_id === photo.id && v.voter_id === userId);

            return (
              <button
                key={i}
                onClick={() => {
                  if (tab === "mine" && status === "empty") handleUpload(i);
                  else if (tab === "mine" && status === "rejected") handleUpload(i);
                  else if (photo) setViewingCell(i);
                }}
                className="sticker"
                style={{
                  background: isWinningCell ? "#F5B301" : sc.bg,
                  borderColor: isWinningCell ? "#241B4D" : sc.border,
                  padding: 10, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 4,
                  aspectRatio: "1", cursor: "pointer", transition: "transform 0.15s",
                  position: "relative",
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.94) rotate(-2deg)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <span style={{ fontSize: 22 }}>{cell.emoji}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#241B4D", textAlign: "center", lineHeight: 1.2 }}>{cell.text}</span>
                {sc.badge && <span style={{ position: "absolute", top: 3, right: 3, fontSize: 12 }}>{sc.badge}</span>}
                {needsReview && (
                  <span style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 10, background: "#FF5C8A", border: "2px solid #241B4D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>!</span>
                )}
                {photo && <span style={{ position: "absolute", bottom: 3, right: 3, fontSize: 9, color: "#8A84A3" }}>
                  {new Date(photo.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>}
              </button>
            );
          })}
        </div>

        {/* Instructions */}
        <div className="sticker-sm" style={{ background: "#FFF4D6", padding: 14, marginTop: 14, textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#241B4D", margin: 0, lineHeight: 1.7 }}>
            🏁 <strong>Race mode:</strong> fill your grid as fast as you can<br />
            📸 <strong>My Grid:</strong> tap empty cells to snap photos<br />
            💕 <strong>{partnerName}&apos;s Grid:</strong> review their photos — ✅ or ❌<br />
            ⏱️ Timestamps track who was fastest<br />
            🏆 First approved row/column/diagonal wins!
          </p>
        </div>
      </div>

      {/* Cell detail viewer */}
      {viewingCell !== null && (() => {
        const viewUid = tab === "mine" ? userId! : partnerId!;
        const photo = photos.find(p => p.cell_index === viewingCell && p.user_id === viewUid);
        if (!photo) { setViewingCell(null); return null; }
        const vote = votes.find(v => v.photo_id === photo.id);
        const canReview = photo.user_id !== userId && !vote;

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(0,0,0,0.85)" }} onClick={() => setViewingCell(null)}>
            <div style={{ width: "100%", maxWidth: 380, background: "#FFF8EC", borderRadius: 28, border: "2px solid #241B4D", boxShadow: "6px 6px 0 #241B4D", overflow: "hidden" }} onClick={(e: any) => e.stopPropagation()}>
              {/* Header */}
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: 18 }}>{cells[viewingCell]?.emoji}</span>
                  <span className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#241B4D", marginLeft: 8 }}>{cells[viewingCell]?.text}</span>
                </div>
                <button onClick={() => setViewingCell(null)} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "#8A84A3" }}>✕</button>
              </div>

              {/* Photo */}
              <PhotoViewer photo={photo} supabase={supabase} />

              {/* Timestamp */}
              <div style={{ padding: "8px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#8A84A3" }}>
                  {photo.user_id === userId ? "🫠 You" : `💕 ${partnerName}`}
                </span>
                <span style={{ fontSize: 11, color: "#8A84A3" }}>
                  ⏱️ {new Date(photo.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Vote status or buttons */}
              <div style={{ padding: "0 20px 20px" }}>
                {vote && (
                  <div className="sticker-sm" style={{ background: vote.approved ? "#E4F8EE" : "#FFE9F0", padding: 12, textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#241B4D", margin: 0 }}>
                      {vote.approved ? "✅ Approved" : "❌ Rejected — needs retake"}
                    </p>
                  </div>
                )}
                {canReview && (
                  <>
                    <p className="font-display" style={{ fontSize: 14, fontWeight: 700, color: "#241B4D", marginBottom: 10, textAlign: "center" }}>
                      Does this match the prompt?
                    </p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => handleVote(photo.id, true)} className="sticker font-display" style={{ flex: 1, padding: 14, fontSize: 15, fontWeight: 700, color: "#fff", background: "#2FC98C", cursor: "pointer" }}>✅ Approve</button>
                      <button onClick={() => handleVote(photo.id, false)} className="sticker font-display" style={{ flex: 1, padding: 14, fontSize: 15, fontWeight: 700, color: "#fff", background: "#FF5C8A", cursor: "pointer" }}>❌ Reject</button>
                    </div>
                  </>
                )}
                {!canReview && !vote && photo.user_id === userId && (
                  <div className="sticker-sm" style={{ background: "#EFEAFF", padding: 12, textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#6C5CE7", margin: 0 }}>⏳ Waiting for {partnerName} to review</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Upload overlay */}
      {uploading && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(36,27,77,0.7)" }}>
          <div className="sticker" style={{ background: "#FFF8EC", padding: 32, textAlign: "center", borderRadius: 28 }}>
            <span className="animate-float" style={{ fontSize: 40, display: "inline-block" }}>📸</span>
            <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#241B4D", marginTop: 12 }}>Uploading...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Photo viewer that loads signed URL
function PhotoViewer({ photo, supabase }: { photo: any; supabase: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from("memes").createSignedUrl(photo.image_url, 3600);
      setUrl(data?.signedUrl || null);
    })();
  }, [photo.image_url]);

  if (!url) return <div style={{ width: "100%", aspectRatio: "1", background: "#FFEFD0", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-float" style={{ fontSize: 32 }}>📸</span></div>;
  return <img src={url} alt="Bingo" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />;
}
