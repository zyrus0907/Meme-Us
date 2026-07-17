"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DailyPrompt, Submission, Reaction } from "@/lib/types";
import { toast } from "sonner";

const EMOJIS: string[] = ["💀", "🔥", "🤡", "😂"];

export default function RevealPage() {
  const { date } = useParams<{ date: string }>();
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [showCountdown, setShowCountdown] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [revealed, setRevealed] = useState(false);

  const [prompt, setPrompt] = useState<DailyPrompt | null>(null);
  const [mySub, setMySub] = useState<Submission | null>(null);
  const [partnerSub, setPartnerSub] = useState<Submission | null>(null);
  const [myImageUrl, setMyImageUrl] = useState<string | null>(null);
  const [partnerImageUrl, setPartnerImageUrl] = useState<string | null>(null);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [partnerReaction, setPartnerReaction] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState("Partner");
  const [myName, setMyName] = useState("You");
  const [reactLoading, setReactLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ url: string; label: string } | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: c } = await supabase.from("couples").select("*").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).eq("status", "linked").maybeSingle();
      if (!c) { router.replace("/onboarding"); return; }
      const partnerId = c.user_a === user.id ? c.user_b : c.user_a;

      const { data: myProf } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      const { data: partProf } = await supabase.from("profiles").select("display_name").eq("id", partnerId).single();
      setMyName(myProf?.display_name || "You");
      setPartnerName(partProf?.display_name || "Partner");

      const { data: dp } = await supabase.from("daily_prompts").select("*").eq("prompt_date", date).maybeSingle();
      if (!dp) { toast.error("No prompt for this date."); router.replace("/today"); return; }
      setPrompt(dp);

      const { data: rd } = await supabase.from("rounds").select("*").eq("couple_id", c.id).eq("prompt_id", dp.id).maybeSingle();
      if (!rd || rd.submitted_count < 2) { setLocked(true); setLoading(false); return; }

      const { data: subs } = await supabase.from("submissions").select("*").eq("couple_id", c.id).eq("prompt_id", dp.id);
      if (!subs || subs.length < 2) { setLocked(true); setLoading(false); return; }

      const mine = subs.find((s: any) => s.user_id === user.id)!;
      const theirs = subs.find((s: any) => s.user_id === partnerId)!;
      setMySub(mine);
      setPartnerSub(theirs);

      const { data: myUrl } = await supabase.storage.from("memes").createSignedUrl(mine.image_url, 3600);
      const { data: partUrl } = await supabase.storage.from("memes").createSignedUrl(theirs.image_url, 3600);
      setMyImageUrl(myUrl?.signedUrl || null);
      setPartnerImageUrl(partUrl?.signedUrl || null);

      const { data: reactions } = await supabase.from("reactions").select("*").in("submission_id", [mine.id, theirs.id]);
      if (reactions) {
        const myR = reactions.find((r: any) => r.submission_id === theirs.id && r.from_user_id === user.id);
        if (myR) setMyReaction(myR.emoji);
        const partR = reactions.find((r: any) => r.submission_id === mine.id && r.from_user_id === partnerId);
        if (partR) setPartnerReaction(partR.emoji);
      }

      setLoading(false);

      const channel = supabase.channel(`reactions-${dp.id}`).on("postgres_changes", { event: "*", schema: "public", table: "reactions", filter: `submission_id=eq.${mine.id}` }, (payload: any) => {
        if (payload.new?.from_user_id === partnerId) setPartnerReaction(payload.new.emoji);
      }).subscribe();
      return () => { supabase.removeChannel(channel); };
    })();
  }, [date]);

  // Countdown
  useEffect(() => {
    if (loading || locked) return;
    if (countdown <= 0) { setShowCountdown(false); setTimeout(() => setRevealed(true), 100); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 600);
    return () => clearTimeout(t);
  }, [countdown, loading, locked]);

  // React to partner's meme
  const handleReact = async (emoji: string) => {
    if (!partnerSub || reactLoading) return;
    setReactLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (myReaction === emoji) {
      await supabase.from("reactions").delete().eq("submission_id", partnerSub.id).eq("from_user_id", user.id);
      setMyReaction(null);
    } else if (myReaction) {
      await supabase.from("reactions").update({ emoji }).eq("submission_id", partnerSub.id).eq("from_user_id", user.id);
      setMyReaction(emoji);
    } else {
      await supabase.from("reactions").insert({ submission_id: partnerSub.id, from_user_id: user.id, emoji });
      setMyReaction(emoji);
    }
    setReactLoading(false);
  };

  // Report
  const handleReport = async () => {
    if (!partnerSub) return;
    setReportLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("reports").insert({ submission_id: partnerSub.id, reporter_id: user.id, reason: reportReason.trim() || null });
    setReportLoading(false);
    if (error?.code === "23505") toast.error("Already reported.");
    else if (error) toast.error("Couldn't report.");
    else { toast.success("Report submitted."); setShowReport(false); }
  };

  // Helper: load image from URL
  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Generate branded export image
  async function generateBrandedImage(): Promise<Blob | null> {
    if (!myImageUrl || !partnerImageUrl || !prompt) return null;

    const W = 1080;
    const H = 1350; // 4:5 ratio — perfect for Instagram
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Background
    ctx.fillStyle = "#FFF8EC";
    ctx.fillRect(0, 0, W, H);

    // Top banner
    ctx.fillStyle = "#241B4D";
    roundRect(ctx, 0, 0, W, 160, 0);
    ctx.fill();

    // App name
    ctx.font = "bold 32px sans-serif";
    ctx.fillStyle = "#FF5C8A";
    ctx.textAlign = "left";
    ctx.fillText("😂 Meme Us", 40, 60);

    // Date
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#8A84A3";
    ctx.textAlign = "right";
    const dateStr = new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    ctx.fillText(dateStr, W - 40, 55);

    // Prompt title
    ctx.font = "bold 44px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(`"${prompt.title}"`, W / 2, 120);

    // Load images
    const [imgA, imgB] = await Promise.all([loadImage(myImageUrl), loadImage(partnerImageUrl)]);

    const imgSize = (W - 60) / 2;
    const imgY = 200;

    // Left card — your meme
    ctx.fillStyle = "#fff";
    roundRect(ctx, 20, imgY - 10, imgSize + 20, imgSize + 80, 20);
    ctx.fill();
    ctx.strokeStyle = "#241B4D";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    roundRect(ctx, 30, imgY, imgSize, imgSize, 16);
    ctx.clip();
    ctx.drawImage(imgA, 30, imgY, imgSize, imgSize);
    ctx.restore();

    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = "#241B4D";
    ctx.textAlign = "center";
    ctx.fillText("🫠 " + myName, 30 + imgSize / 2, imgY + imgSize + 45);

    // Right card — partner's meme
    const rx = W / 2 + 10;
    ctx.fillStyle = "#fff";
    roundRect(ctx, rx - 10, imgY - 10, imgSize + 20, imgSize + 80, 20);
    ctx.fill();
    ctx.strokeStyle = "#241B4D";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    roundRect(ctx, rx, imgY, imgSize, imgSize, 16);
    ctx.clip();
    ctx.drawImage(imgB, rx, imgY, imgSize, imgSize);
    ctx.restore();

    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = "#241B4D";
    ctx.textAlign = "center";
    ctx.fillText("💕 " + partnerName, rx + imgSize / 2, imgY + imgSize + 45);

    // VS badge
    ctx.fillStyle = "#FF5C8A";
    const vsX = W / 2, vsY = imgY + imgSize / 2;
    ctx.beginPath();
    ctx.arc(vsX, vsY, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#241B4D";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VS", vsX, vsY);
    ctx.textBaseline = "alphabetic";

    // Prompt description
    const descY = imgY + imgSize + 100;
    ctx.fillStyle = "#FFF4D6";
    roundRect(ctx, 40, descY, W - 80, 70, 16);
    ctx.fill();
    ctx.strokeStyle = "#F5B301";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#8A84A3";
    ctx.textAlign = "center";
    const desc = prompt.description.length > 70 ? prompt.description.slice(0, 67) + "..." : prompt.description;
    ctx.fillText(desc, W / 2, descY + 42);

    // Footer
    ctx.fillStyle = "#241B4D";
    roundRect(ctx, 0, H - 90, W, 90, 0);
    ctx.fill();
    ctx.font = "bold 28px sans-serif";
    ctx.fillStyle = "#FF5C8A";
    ctx.textAlign = "center";
    ctx.fillText("😂 Meme Us — memeus.app", W / 2, H - 42);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#8A84A3";
    ctx.fillText("Daily meme game for couples · Blind reveal edition", W / 2, H - 16);

    return new Promise((resolve) => {
      canvas.toBlob(b => resolve(b), "image/jpeg", 0.92);
    });
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Share branded image
  const handleShare = async () => {
    setSaving(true);
    try {
      const blob = await generateBrandedImage();
      if (!blob) throw new Error("Failed to generate");
      const file = new File([blob], `memeus-${date}.jpg`, { type: "image/jpeg" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `Meme Us: "${prompt?.title}"`, text: `${myName} vs ${partnerName}`, files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `memeus-${date}.jpg`; a.click();
        URL.revokeObjectURL(url);
        toast.success("Image saved!");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") toast.error("Couldn't share.");
    }
    setSaving(false);
  };

  // Save branded image directly
  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await generateBrandedImage();
      if (!blob) throw new Error("Failed");
      const file = new File([blob], `memeus-${date}.jpg`, { type: "image/jpeg" });
      if (navigator.share) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `memeus-${date}.jpg`; a.click();
        URL.revokeObjectURL(url);
      }
      toast.success("Saved! 📥");
    } catch (err: any) { if (err.name !== "AbortError") toast.error("Couldn't save."); }
    setSaving(false);
  };

  // Share or save a single image
  const handleSingleImage = async (url: string | null, label: string) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${label.toLowerCase().replace(/\s/g, "-")}.jpg`, { type: "image/jpeg" });

      // Try native share (works on iPhone)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // Fallback: download
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success("Saved!");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast.error("Try long-pressing the image instead.");
      }
    }
  };

  // ===== LOADING =====
  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span className="animate-float" style={{ fontSize: 48 }}>🎭</span>
    </div>
  );

  // ===== LOCKED =====
  if (locked) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", gap: 16 }}>
      <span style={{ fontSize: 48 }}>🔒</span>
      <p className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#241B4D" }}>Not unlocked yet</p>
      <p style={{ fontSize: 14, color: "#8A84A3" }}>Both partners need to submit first.</p>
      <button onClick={() => router.replace("/today")} className="sticker font-display" style={{ padding: "14px 32px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#FF5C8A", cursor: "pointer" }}>Go to today</button>
    </div>
  );

  // ===== COUNTDOWN =====
  if (showCountdown) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#241B4D", gap: 16 }}>
      <style>{`@keyframes countPop{from{transform:scale(2);opacity:0}to{transform:scale(1);opacity:1}}.count-pop{animation:countPop .5s cubic-bezier(.34,1.56,.64,1) both}`}</style>
      <div key={countdown} className="count-pop">
        <span className="font-display" style={{ fontSize: countdown === 0 ? 48 : 100, fontWeight: 700, color: countdown === 0 ? "#F5B301" : "#fff" }}>
          {countdown === 0 ? "REVEAL! 🎉" : countdown}
        </span>
      </div>
    </div>
  );

  // ===== REVEALED =====
  const cardStyle = { background: "#fff", border: "2px solid #241B4D", borderRadius: 20, boxShadow: "4px 4px 0 #241B4D", overflow: "hidden", minWidth: 0 };
  const imgStyle = { width: "100%", aspectRatio: "1", objectFit: "cover" as const, display: "block", maxWidth: "100%" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`@keyframes cardFlip{from{transform:rotateY(90deg) scale(.8);opacity:0}to{transform:rotateY(0) scale(1);opacity:1}}.card-flip{animation:cardFlip .6s cubic-bezier(.34,1.56,.64,1) both}.card-flip-delay{animation:cardFlip .6s cubic-bezier(.34,1.56,.64,1) .2s both}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 8px", flexShrink: 0 }}>
        <button onClick={() => router.back()} className="sticker-sm" style={{ padding: 10, background: "#fff", borderRadius: 14, display: "flex", cursor: "pointer" }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#241B4D", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>&ldquo;{prompt?.title}&rdquo;</p>
          <p style={{ fontSize: 12, color: "#8A84A3", margin: 0 }}>{new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
        </div>
        <button onClick={() => setShowReport(true)} className="sticker-sm" style={{ padding: "6px 12px", background: "#fff", borderRadius: 12, fontSize: 14, cursor: "pointer" }}>🚩</button>
      </div>

      {/* Scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 32px" }} className="no-bar">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Prompt */}
          {prompt && (
            <div className="sticker-sm" style={{ background: "#FFF4D6", padding: "10px 16px", textAlign: "center", borderColor: "#F5B301" }}>
              <p style={{ fontSize: 12, color: "#8A84A3", margin: 0 }}>{prompt.description}</p>
            </div>
          )}

          {/* Side-by-side memes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, overflow: "hidden" }}>
            {/* Your meme */}
            <div className={revealed ? "card-flip" : ""} style={{ ...cardStyle, transform: "rotate(-1deg)" }}>
              <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>🫠</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#241B4D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myName}</span>
              </div>
              {myImageUrl && <img src={myImageUrl} alt="Your meme" style={{ ...imgStyle, cursor: "pointer" }} onClick={() => setZoomImage({ url: myImageUrl, label: myName })} />}
              <div style={{ padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {partnerReaction && (
                  <span className="sticker-pill" style={{ background: "#FFEFD0", padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{partnerReaction} {partnerName}</span>
                )}
                <button onClick={() => handleSingleImage(myImageUrl, "my-meme")} style={{ fontSize: 11, color: "#6C5CE7", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontWeight: 700 }}>📤 Share</button>
              </div>
            </div>

            {/* Partner's meme */}
            <div className={revealed ? "card-flip-delay" : ""} style={{ ...cardStyle, transform: "rotate(1deg)" }}>
              <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>💕</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#241B4D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{partnerName}</span>
              </div>
              {partnerImageUrl && <img src={partnerImageUrl} alt="Partner's meme" style={{ ...imgStyle, cursor: "pointer" }} onClick={() => setZoomImage({ url: partnerImageUrl, label: partnerName })} />}
              <div style={{ padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {myReaction && (
                  <span className="sticker-pill" style={{ background: "#FFE9F0", padding: "2px 8px", fontSize: 11, fontWeight: 700, borderColor: "#FF5C8A" }}>{myReaction} you</span>
                )}
                <button onClick={() => handleSingleImage(partnerImageUrl, "their-meme")} style={{ fontSize: 11, color: "#6C5CE7", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontWeight: 700 }}>📤 Share</button>
              </div>
            </div>
          </div>

          {/* Long-press hint */}
          <p style={{ fontSize: 11, color: "#8A84A3", textAlign: "center", margin: 0 }}>
            💡 Long-press any image to save it directly or use as a sticker
          </p>

          {/* Reaction picker */}
          <div className="sticker" style={{ background: "#fff", padding: 18, textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#8A84A3", marginBottom: 12 }}>React to {partnerName}&apos;s meme</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              {EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => handleReact(emoji)} disabled={reactLoading}
                  style={{
                    fontSize: 26, padding: 12, borderRadius: 16,
                    border: `2px solid ${myReaction === emoji ? "#FF5C8A" : "#241B4D"}`,
                    background: myReaction === emoji ? "#FFE9F0" : "#fff",
                    boxShadow: myReaction === emoji ? "3px 3px 0 #241B4D" : "2px 2px 0 #241B4D",
                    transform: myReaction === emoji ? "rotate(-6deg) scale(1.1)" : "none",
                    transition: "all 0.2s", cursor: "pointer",
                  }}
                >{emoji}</button>
              ))}
            </div>
            {myReaction && <p style={{ fontSize: 11, color: "#8A84A3", marginTop: 6 }}>Tap again to change or remove</p>}
          </div>

          {/* ===== SHARE & SAVE BUTTONS ===== */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleShare} disabled={saving} className="sticker font-display"
              style={{ flex: 1, padding: 16, fontSize: 15, fontWeight: 700, color: "#fff", background: "#6C5CE7", cursor: "pointer", transition: "transform 0.15s", opacity: saving ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              📤 Share
            </button>
            <button onClick={handleSave} disabled={saving} className="sticker font-display"
              style={{ flex: 1, padding: 16, fontSize: 15, fontWeight: 700, color: "#241B4D", background: "#FFEFD0", cursor: "pointer", transition: "transform 0.15s", opacity: saving ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              💾 Save
            </button>
          </div>

          <div className="sticker-sm" style={{ background: "#EFEAFF", padding: "10px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#8A84A3", margin: 0 }}>
              📤 Share generates a branded image with both memes, your names, and the Meme Us logo — perfect for Instagram Stories!<br />
              💾 Save downloads it to your phone.
            </p>
          </div>

          <div className="sticker-sm" style={{ background: "#FFEFD0", padding: 10, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#8A84A3", margin: 0 }}>Both memes are locked in — no edits, no takebacks. That&apos;s the game. 🎲</p>
          </div>
        </div>
      </div>

      {/* Fullscreen zoom viewer */}
      {zoomImage && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          onClick={() => setZoomImage(null)}
        >
          <div style={{ position: "absolute", top: 16, right: 16, left: 16, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{zoomImage.label}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setZoomImage(null); }}
              style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "none", fontSize: 20, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >✕</button>
          </div>
          <img
            src={zoomImage.url}
            alt={zoomImage.label}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "95%", maxHeight: "75vh", objectFit: "contain", borderRadius: 12, userSelect: "none" }}
          />
          <div style={{ marginTop: 20, display: "flex", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleSingleImage(zoomImage.url, zoomImage.label)}
              style={{ padding: "12px 24px", borderRadius: 999, background: "#6C5CE7", border: "2px solid #fff", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >📤 Share</button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(zoomImage.url);
                  const blob = await res.blob();
                  const file = new File([blob], "meme.jpg", { type: "image/jpeg" });
                  if (navigator.share) {
                    await navigator.share({ files: [file] });
                  } else {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "meme.jpg";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }
                } catch (err: any) { if (err.name !== "AbortError") toast.error("Try long-pressing instead."); }
              }}
              style={{ padding: "12px 24px", borderRadius: 999, background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >💾 Save</button>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Long-press image to save as sticker</p>
        </div>
      )}

      {/* Report modal */}
      {showReport && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(36,27,77,0.5)" }} onClick={() => setShowReport(false)}>
          <div style={{ width: "100%", maxWidth: 430, background: "#FFF8EC", borderRadius: "24px 24px 0 0", borderTop: "2px solid #241B4D", padding: 24 }} onClick={(e: any) => e.stopPropagation()}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: "#CBC2E8", margin: "0 auto 16px" }} />
            <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700, color: "#241B4D", marginBottom: 8 }}>🚩 Report this meme</h3>
            <p style={{ fontSize: 13, color: "#8A84A3", lineHeight: 1.5, marginBottom: 14 }}>If this contains harmful or inappropriate content, let us know.</p>
            <textarea value={reportReason} onChange={(e: any) => setReportReason(e.target.value)} placeholder="What's wrong? (optional)" maxLength={500} rows={3}
              style={{ width: "100%", padding: 12, fontSize: 14, border: "2px solid #241B4D", borderRadius: 14, boxShadow: "2px 2px 0 #241B4D", outline: "none", resize: "none", background: "#fff", color: "#241B4D", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowReport(false)} className="font-display" style={{ flex: 1, padding: 14, fontSize: 14, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 16, boxShadow: "3px 3px 0 #241B4D", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleReport} disabled={reportLoading} className="font-display" style={{ flex: 1, padding: 14, fontSize: 14, fontWeight: 700, color: "#fff", background: "#FF5C8A", border: "2px solid #241B4D", borderRadius: 16, boxShadow: "3px 3px 0 #241B4D", cursor: "pointer", opacity: reportLoading ? 0.6 : 1 }}>
                {reportLoading ? "..." : "🚩 Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
