"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function FlashHuntPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState("Partner");
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [hunt, setHunt] = useState<any>(null);
  const [mySubmission, setMySubmission] = useState<any>(null);
  const [partnerSubmission, setPartnerSubmission] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [myImageUrl, setMyImageUrl] = useState<string | null>(null);
  const [partnerImageUrl, setPartnerImageUrl] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const loadHunt = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);

      const { data: c } = await supabase.from("couples").select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .eq("status", "linked").maybeSingle();
      if (!c) { router.replace("/onboarding"); return; }
      setCoupleId(c.id);

    const pid = c.user_a === user.id ? c.user_b : c.user_a;
    setPartnerId(pid);
    const { data: pp } = await supabase.from("profiles").select("display_name").eq("id", pid).single();
    setPartnerName(pp?.display_name || "Partner");

    // Get latest active or recent hunt
    const { data: h } = await supabase.from("flash_hunts").select("*")
      .eq("couple_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!h) { setLoading(false); return; }
    setHunt(h);

    // Check expiry
    if (new Date(h.expires_at) < new Date() && h.status === "active") {
      setExpired(true);
    }

    // Get submissions
    const { data: subs } = await supabase.from("flash_submissions").select("*").eq("hunt_id", h.id);
    if (subs) {
      const mine = subs.find((s: any) => s.user_id === user.id);
      const theirs = subs.find((s: any) => s.user_id === pid);
      setMySubmission(mine || null);
      setPartnerSubmission(theirs || null);

      if (mine) {
        const { data: url } = await supabase.storage.from("memes").createSignedUrl(mine.image_url, 3600);
        setMyImageUrl(url?.signedUrl || null);
      }
      if (theirs) {
        const { data: url } = await supabase.storage.from("memes").createSignedUrl(theirs.image_url, 3600);
        setPartnerImageUrl(url?.signedUrl || null);
      }
    }

    setLoading(false);
    } catch (err) {
      console.error("Flash hunt load error:", err);
      setLoading(false);
    }
  };

  useEffect(() => { loadHunt(); }, []);

  // Safety: never stay on loading forever
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!hunt || hunt.status !== "active") return;
    const tick = () => {
      const diff = new Date(hunt.expires_at).getTime() - Date.now();
      if (diff <= 0) { setExpired(true); setTimeLeft("0:00"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [hunt]);

  // Realtime
  useEffect(() => {
    if (!hunt) return;
    const ch = supabase.channel(`flash-${hunt.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_submissions", filter: `hunt_id=eq.${hunt.id}` }, () => loadHunt())
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_hunts", filter: `id=eq.${hunt.id}` }, () => loadHunt())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [hunt?.id]);

  // Submit photo
  const handleSubmit = () => {
    if (!hunt || !userId || !coupleId || mySubmission || expired) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(true);

      try {
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

        const blob = await new Promise<Blob>((res, rej) => {
          sq.toBlob(b => b ? res(b) : rej(), "image/jpeg", 0.75);
        });

        const filePath = `${coupleId}/flash/${hunt.id}/${userId}.jpg`;
        const { error: upErr } = await supabase.storage.from("memes").upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from("flash_submissions").insert({ hunt_id: hunt.id, user_id: userId, image_url: filePath });
        if (insErr) throw insErr;

        // Check if first — update hunt status
        if (!partnerSubmission) {
          // I'm first!
          await supabase.from("flash_hunts").update({ winner_id: userId, status: "won" }).eq("id", hunt.id).eq("status", "active");
        }

        toast.success("Submitted! ⚡");

        // Notify partner
        if (partnerId) {
          fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partner_id: partnerId, title: "⚡ Flash Hunt submitted!", message: "Your partner was fast — check the result!", url: "/flash-hunt" })
          }).catch(() => {});
        }

        await loadHunt();
      } catch (err: any) {
        console.error(err);
        toast.error("Upload failed. Try again!");
      }
      setUploading(false);
    };
    input.click();
  };

  // Also need storage policy for flash paths
  // This should already work since we added the bingo policy that allows any path

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-float" style={{ fontSize: 48 }}>⚡</span></div>;

  // No active hunt
  if (!hunt) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", gap: 16 }}>
      <span style={{ fontSize: 64 }}>⚡</span>
      <h2 className="font-display" style={{ fontSize: 24, fontWeight: 700, color: "#241B4D", margin: 0 }}>No Flash Hunt right now</h2>
      <p style={{ fontSize: 14, color: "#8A84A3", maxWidth: 280 }}>Flash Hunts drop randomly 2-3 times a week. You'll get a push notification when one starts!</p>
      <button onClick={() => router.back()} className="sticker font-display" style={{ padding: "14px 32px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#6C5CE7", cursor: "pointer" }}>Back to home</button>

    </div>
  );

  const isActive = hunt.status === "active" && !expired;
  const isWon = hunt.status === "won" || (mySubmission && partnerSubmission);
  const iWon = hunt.winner_id === userId;
  const bothSubmitted = mySubmission && partnerSubmission;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 8px", flexShrink: 0 }}>
        <button onClick={() => router.back()} className="sticker-sm" style={{ padding: 10, background: "#fff", borderRadius: 14, display: "flex", cursor: "pointer" }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#241B4D", margin: 0 }}>⚡ Flash Hunt</h1>
        </div>
        {isActive && (
          <div className="sticker-pill" style={{ background: timeLeft.startsWith("0:") || timeLeft.startsWith("1:") ? "#FF5C8A" : "#F5B301", padding: "6px 16px" }}>
            <span className="font-display" style={{ fontSize: 18, fontWeight: 700, color: timeLeft.startsWith("0:") ? "#fff" : "#241B4D" }}>⏱️ {timeLeft}</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 32px" }} className="no-bar">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Challenge card */}
          <div className="sticker animate-pop-in" style={{ background: isActive ? "linear-gradient(135deg, #6C5CE7, #FF5C8A)" : "#241B4D", padding: 28, textAlign: "center" }}>
            <span style={{ fontSize: 56 }}>{hunt.prompt_emoji}</span>
            <h2 className="font-display" style={{ fontSize: 28, fontWeight: 700, color: "#fff", margin: "12px 0 4px" }}>{hunt.prompt_text}</h2>
            {isActive && !mySubmission && (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Find it and snap a photo — GO!</p>
            )}
            {isActive && mySubmission && !partnerSubmission && (
              <p style={{ fontSize: 14, color: "#F5B301" }}>⏳ You submitted! Waiting for {partnerName}...</p>
            )}
            {expired && !isWon && (
              <p style={{ fontSize: 14, color: "#FF5C8A" }}>⏰ Time's up! Nobody submitted in time.</p>
            )}
          </div>

          {/* Winner banner */}
          {isWon && (
            <div className="sticker animate-pop-in" style={{ background: iWon ? "#F5B301" : "#FFE9F0", padding: 24, textAlign: "center" }}>
              <span style={{ fontSize: 48 }}>{iWon ? "🏆" : "😤"}</span>
              <p className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#241B4D", margin: "8px 0 0" }}>
                {iWon ? "You won! ⚡" : `${partnerName} was faster!`}
              </p>
              {mySubmission && partnerSubmission && (
                <p style={{ fontSize: 13, color: "#8A84A3", marginTop: 6 }}>
                  Difference: {Math.abs(
                    new Date(mySubmission.submitted_at).getTime() - new Date(partnerSubmission.submitted_at).getTime()
                  ) / 1000}s apart
                </p>
              )}
            </div>
          )}

          {/* Submit button */}
          {isActive && !mySubmission && (
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="sticker font-display animate-pop-in"
              style={{
                width: "100%", padding: 22, fontSize: 20, fontWeight: 700,
                color: "#fff", background: "#FF5C8A", cursor: "pointer",
                transition: "transform 0.15s", opacity: uploading ? 0.6 : 1,
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96) rotate(-1deg)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {uploading ? "⏳ Uploading..." : "📸 SNAP IT — GO!"}
            </button>
          )}

          {/* Submissions */}
          {(mySubmission || partnerSubmission) && (
            <div style={{ display: "grid", gridTemplateColumns: bothSubmitted ? "1fr 1fr" : "1fr", gap: 12 }}>
              {mySubmission && (
                <div className="sticker animate-pop-in" style={{ background: "#fff", overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>🫠</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#241B4D" }}>You</span>
                    {hunt.winner_id === userId && <span style={{ fontSize: 12, marginLeft: "auto" }}>🏆</span>}
                  </div>
                  {myImageUrl && (
                    <img src={myImageUrl} alt="Your submission" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                  )}
                  <div style={{ padding: "6px 12px" }}>
                    <span style={{ fontSize: 11, color: "#8A84A3" }}>
                      ⏱️ {new Date(mySubmission.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                </div>
              )}
              {partnerSubmission && (
                <div className="sticker animate-pop-in" style={{ background: "#fff", overflow: "hidden", animationDelay: "100ms" }}>
                  <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>💕</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#241B4D" }}>{partnerName}</span>
                    {hunt.winner_id === partnerId && <span style={{ fontSize: 12, marginLeft: "auto" }}>🏆</span>}
                  </div>
                  {partnerImageUrl && (
                    <img src={partnerImageUrl} alt="Partner submission" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                  )}
                  <div style={{ padding: "6px 12px" }}>
                    <span style={{ fontSize: 11, color: "#8A84A3" }}>
                      ⏱️ {new Date(partnerSubmission.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="sticker-sm" style={{ background: "#FFF4D6", padding: 14, textAlign: "center" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#241B4D", margin: 0, lineHeight: 1.7 }}>
              ⚡ Flash Hunts drop randomly 2-3x per week<br />
              ⏱️ 10 minutes to find and photograph the target<br />
              🏆 First to submit wins the round<br />
              📱 Push notifications alert both partners simultaneously
            </p>
          </div>
        </div>
      </div>

      {/* Upload overlay */}
      {uploading && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(36,27,77,0.7)" }}>
          <div className="sticker" style={{ background: "#FFF8EC", padding: 32, textAlign: "center", borderRadius: 28 }}>
            <span className="animate-float" style={{ fontSize: 40, display: "inline-block" }}>⚡</span>
            <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#241B4D", marginTop: 12 }}>Uploading...</p>
          </div>
        </div>
      )}
    </div>
  );
}
