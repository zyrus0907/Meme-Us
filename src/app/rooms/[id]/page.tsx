"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const EMOJIS = ["💀", "🔥", "🤡", "😂"];

export default function RoomDetailPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [room, setRoom] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [prompt, setPrompt] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [reactions, setReactions] = useState<any[]>([]);
  const [mySubmission, setMySubmission] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [copied, setCopied] = useState(false);
  const [topText, setTopText] = useState("");
  const [botText, setBotText] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const loadRoom = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);

      const { data: r } = await supabase.from("rooms").select("*").eq("id", roomId).single();
      if (!r) { toast.error("Room not found"); router.replace("/rooms"); return; }
      setRoom(r);

      // Members with profiles
      const { data: mems } = await supabase.from("room_members").select("user_id, joined_at").eq("room_id", roomId);
      if (mems) {
        const profiles = await Promise.all(mems.map(async (m) => {
          const { data: p } = await supabase.from("profiles").select("display_name").eq("id", m.user_id).single();
          return { ...m, display_name: p?.display_name || "Anonymous" };
        }));
        setMembers(profiles);
      }

      // Today's prompt
      await supabase.rpc("ensure_today_prompt");
      const today = new Date().toISOString().split("T")[0];
      const { data: dp } = await supabase.from("daily_prompts").select("*").eq("prompt_date", today).maybeSingle();
      setPrompt(dp);

      if (dp) {
        // Submissions for today
        const { data: subs } = await supabase.from("room_submissions").select("*").eq("room_id", roomId).eq("prompt_id", dp.id).order("created_at", { ascending: true });

        if (subs) {
          // Get signed URLs and profile names
          const enriched = await Promise.all(subs.map(async (s) => {
            const { data: url } = await supabase.storage.from("memes").createSignedUrl(s.image_url, 3600);
            const member = (mems || []).find((m: any) => m.user_id === s.user_id);
            const { data: p } = await supabase.from("profiles").select("display_name").eq("id", s.user_id).single();
            return { ...s, signed_url: url?.signedUrl, display_name: p?.display_name || "Anonymous" };
          }));
          setSubmissions(enriched);
          setMySubmission(enriched.find(s => s.user_id === user.id) || null);

          // Reactions
          const subIds = subs.map(s => s.id);
          if (subIds.length > 0) {
            const { data: rxns } = await supabase.from("room_reactions").select("*").in("submission_id", subIds);
            setReactions(rxns || []);
          }
        }
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => { loadRoom(); }, []);

  // Realtime
  useEffect(() => {
    if (!roomId || !prompt) return;
    const ch = supabase.channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_submissions", filter: `room_id=eq.${roomId}` }, () => loadRoom())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_reactions" }, () => loadRoom())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId, prompt?.id]);

  // Open photo picker
  const openPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(720 / bitmap.width, 720 / bitmap.height, 1);
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const sq = document.createElement("canvas");
      const crop = Math.min(canvas.width, canvas.height);
      sq.width = crop; sq.height = crop;
      sq.getContext("2d")!.drawImage(canvas, (canvas.width - crop) / 2, (canvas.height - crop) / 2, crop, crop, 0, 0, crop, crop);
      setPhotoDataUrl(sq.toDataURL("image/jpeg", 0.85));
      setShowEditor(true);
    };
    input.click();
  };

  // Submit
  const submitPhoto = async () => {
    if (!photoDataUrl || !prompt || !userId) return;
    setUploading(true);
    try {
      // Burn text into image
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = photoDataUrl; });
      const canvas = document.createElement("canvas");
      const SIZE = 720;
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);

      if (topText.trim()) {
        const fs = Math.floor(SIZE * 0.06);
        ctx.font = `bold ${fs}px Impact, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.strokeStyle = "#000"; ctx.lineWidth = fs * 0.15; ctx.lineJoin = "round";
        ctx.strokeText(topText.toUpperCase(), SIZE / 2, SIZE * 0.03);
        ctx.fillStyle = "#fff";
        ctx.fillText(topText.toUpperCase(), SIZE / 2, SIZE * 0.03);
      }
      if (botText.trim()) {
        const fs = Math.floor(SIZE * 0.06);
        ctx.font = `bold ${fs}px Impact, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.strokeStyle = "#000"; ctx.lineWidth = fs * 0.15; ctx.lineJoin = "round";
        ctx.strokeText(botText.toUpperCase(), SIZE / 2, SIZE * 0.97);
        ctx.fillStyle = "#fff";
        ctx.fillText(botText.toUpperCase(), SIZE / 2, SIZE * 0.97);
      }

      const blob = await new Promise<Blob>((res, rej) => { canvas.toBlob(b => b ? res(b) : rej(), "image/jpeg", 0.85); });
      const filePath = `room/${roomId}/${prompt.id}/${userId}.jpg`;
      await supabase.storage.from("memes").upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
      await supabase.from("room_submissions").insert({
        room_id: roomId, prompt_id: prompt.id, user_id: userId,
        image_url: filePath, top_text: topText.trim() || null, bottom_text: botText.trim() || null,
      });
      toast.success("Posted! 📸");
      setShowEditor(false); setPhotoDataUrl(null); setTopText(""); setBotText("");
      await loadRoom();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to post.");
    }
    setUploading(false);
  };

  // React
  const handleReact = async (subId: string, emoji: string) => {
    const existing = reactions.find(r => r.submission_id === subId && r.from_user_id === userId);
    if (existing?.emoji === emoji) {
      await supabase.from("room_reactions").delete().eq("id", existing.id);
    } else if (existing) {
      await supabase.from("room_reactions").update({ emoji }).eq("id", existing.id);
    } else {
      await supabase.from("room_reactions").insert({ submission_id: subId, from_user_id: userId, emoji });
    }
    await loadRoom();
  };

  const copyCode = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.invite_code);
    setCopied(true); toast.success("Code copied!"); setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = async () => {
    if (!confirm("Leave this room?")) return;
    await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
    toast.success("Left the room");
    router.replace("/rooms");
  };

  const S = {
    card: { background: "#fff", border: "2px solid #241B4D", borderRadius: 20, boxShadow: "4px 4px 0 #241B4D" } as any,
  };

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-bounce-load" style={{ fontSize: 48 }}>🏠</span></div>;
  if (!room) return null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 8px", flexShrink: 0 }}>
        <button onClick={() => router.push("/rooms")} className="sticker-sm" style={{ padding: 10, background: "#fff", borderRadius: 14, display: "flex", cursor: "pointer" }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#241B4D", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🏠 {room.name}</h1>
          <p style={{ fontSize: 12, color: "#8A84A3", margin: 0 }}>{members.length} members</p>
        </div>
        <button onClick={() => setShowMembers(true)} className="sticker-pill" style={{ background: "#EFEAFF", padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#6C5CE7", cursor: "pointer" }}>
          👥 {members.length}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 32px" }} className="no-bar">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Prompt */}
          {prompt && (
            <div className="animate-pop-in" style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ background: "#6C5CE7", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="sticker-pill font-display" style={{ background: "#fff", padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#241B4D" }}>⚡ TODAY</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{submissions.length}/{members.length} posted</span>
              </div>
              <div style={{ padding: "16px 18px" }}>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#241B4D", margin: 0 }}>&ldquo;{prompt.title}&rdquo;</h2>
                <p style={{ fontSize: 13, color: "#8A84A3", marginTop: 6 }}>{prompt.description}</p>
              </div>
            </div>
          )}

          {/* Submit button */}
          {prompt && !mySubmission && (
            <button onClick={openPicker} disabled={uploading} className="sticker font-display animate-pop-in"
              style={{ width: "100%", padding: 18, fontSize: 17, fontWeight: 700, color: "#fff", background: "#FF5C8A", cursor: "pointer", transition: "transform 0.15s" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              📸 Post your meme
            </button>
          )}

          {/* Feed — rolling reveals */}
          {submissions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#8A84A3", textTransform: "uppercase", letterSpacing: 1 }}>Today's memes</p>
              {submissions.map((sub, i) => {
                const subReactions = reactions.filter(r => r.submission_id === sub.id);
                const myReaction = subReactions.find(r => r.from_user_id === userId)?.emoji;
                return (
                  <div key={sub.id} className="animate-pop-in" style={{ ...S.card, overflow: "hidden", animationDelay: `${i * 60}ms` }}>
                    {/* Author */}
                    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#241B4D" }}>
                        {sub.user_id === userId ? "🫠 You" : `💜 ${sub.display_name}`}
                      </span>
                      <span style={{ fontSize: 11, color: "#8A84A3" }}>
                        {new Date(sub.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {/* Image */}
                    {sub.signed_url && (
                      <img src={sub.signed_url} alt="Meme" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                    )}
                    {/* Reactions */}
                    <div style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {EMOJIS.map(emoji => {
                        const count = subReactions.filter(r => r.emoji === emoji).length;
                        const active = myReaction === emoji;
                        return (
                          <button key={emoji} onClick={() => sub.user_id !== userId && handleReact(sub.id, emoji)}
                            style={{
                              padding: "4px 10px", borderRadius: 999, fontSize: 14, fontWeight: 700,
                              border: `2px solid ${active ? "#FF5C8A" : "#241B4D"}`,
                              background: active ? "#FFE9F0" : "#fff",
                              boxShadow: `2px 2px 0 ${active ? "#FF5C8A" : "#241B4D"}`,
                              cursor: sub.user_id === userId ? "default" : "pointer",
                              opacity: sub.user_id === userId ? 0.5 : 1,
                            }}>
                            {emoji} {count > 0 && count}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Invite */}
          <div className="sticker-sm" style={{ background: "#FFF4D6", padding: 14, textAlign: "center" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#241B4D", marginBottom: 8 }}>Invite friends</p>
            <button onClick={copyCode} className="sticker-pill font-display" style={{ background: "#fff", padding: "8px 20px", fontSize: 16, fontWeight: 700, color: "#241B4D", cursor: "pointer", letterSpacing: "0.2em" }}>
              {copied ? "✓ Copied!" : room.invite_code}
            </button>
          </div>
        </div>
      </div>

      {/* Members modal */}
      {showMembers && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(36,27,77,0.5)" }} onClick={() => setShowMembers(false)}>
          <div style={{ width: "100%", maxWidth: 430, background: "#FFF8EC", borderRadius: "24px 24px 0 0", borderTop: "2px solid #241B4D", padding: 24 }} onClick={(e: any) => e.stopPropagation()}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: "#CBC2E8", margin: "0 auto 16px" }} />
            <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#241B4D", marginBottom: 14 }}>👥 Members ({members.length})</h3>
            {members.map((m, i) => (
              <div key={m.user_id} className="sticker-sm" style={{ background: "#fff", padding: 12, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#241B4D" }}>
                  {m.user_id === userId ? `🫠 ${m.display_name} (you)` : `💜 ${m.display_name}`}
                </span>
                {m.user_id === room.created_by && <span style={{ fontSize: 11, color: "#F5B301", fontWeight: 700 }}>👑 Creator</span>}
              </div>
            ))}
            <button onClick={leaveRoom} className="font-display" style={{ width: "100%", marginTop: 12, padding: 14, fontSize: 14, fontWeight: 700, color: "#FF5C8A", background: "#FFE9F0", border: "2px solid #FF5C8A", borderRadius: 16, boxShadow: "2px 2px 0 #FF5C8A", cursor: "pointer" }}>
              🚪 Leave room
            </button>
          </div>
        </div>
      )}

      {/* Photo editor modal */}
      {showEditor && photoDataUrl && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#241B4D", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", flexShrink: 0 }}>
            <button onClick={() => { setShowEditor(false); setPhotoDataUrl(null); }} style={{ padding: 8, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", fontSize: 14 }}>← Cancel</button>
            <span className="sticker-pill font-display" style={{ background: "#F5B301", padding: "4px 14px", fontSize: 12, fontWeight: 700, color: "#241B4D" }}>&ldquo;{prompt?.title}&rdquo;</span>
          </div>
          <div style={{ flex: 1, margin: "0 16px", position: "relative", overflow: "hidden", borderRadius: 20, border: "2px solid rgba(255,255,255,0.2)" }}>
            <img src={photoDataUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {topText && <div style={{ position: "absolute", top: 12, left: 12, right: 12, textAlign: "center", fontFamily: "Impact, sans-serif", fontSize: "clamp(14px, 5vw, 24px)", color: "#fff", textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000", textTransform: "uppercase", wordBreak: "break-word" }}>{topText}</div>}
            {botText && <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, textAlign: "center", fontFamily: "Impact, sans-serif", fontSize: "clamp(14px, 5vw, 24px)", color: "#fff", textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000", textTransform: "uppercase", wordBreak: "break-word" }}>{botText}</div>}
          </div>
          <div style={{ padding: "12px 16px 8px", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <input value={topText} onChange={(e) => setTopText(e.target.value)} placeholder="TOP TEXT" maxLength={60} style={{ width: "100%", padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 12, outline: "none" }} />
            <input value={botText} onChange={(e) => setBotText(e.target.value)} placeholder="BOTTOM TEXT" maxLength={60} style={{ width: "100%", padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 12, outline: "none" }} />
          </div>
          <div style={{ padding: "4px 16px 24px", flexShrink: 0 }}>
            <button onClick={submitPhoto} disabled={uploading} className="sticker font-display"
              style={{ width: "100%", padding: 18, fontSize: 17, fontWeight: 700, color: "#fff", background: "#FF5C8A", cursor: "pointer", opacity: uploading ? 0.6 : 1 }}>
              {uploading ? "⏳ Posting..." : "🚀 Post to room"}
            </button>
          </div>
        </div>
      )}

      {uploading && !showEditor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(36,27,77,0.7)" }}>
          <div className="sticker" style={{ background: "#FFF8EC", padding: 32, textAlign: "center", borderRadius: 28 }}>
            <span className="animate-bounce-load" style={{ fontSize: 40, display: "inline-block" }}>📸</span>
            <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#241B4D", marginTop: 12 }}>Posting...</p>
          </div>
        </div>
      )}
    </div>
  );
}
