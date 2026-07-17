"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DailyPrompt, Couple } from "@/lib/types";
import { toast } from "sonner";

type Stage = "pick" | "edit" | "uploading" | "done";

export default function CreatePage() {
  const [stage, setStage] = useState<Stage>("pick");
  const [user, setUser] = useState<any>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [prompt, setPrompt] = useState<DailyPrompt | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [topText, setTopText] = useState("");
  const [botText, setBotText] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUser(user);

      const { data: c } = await supabase.from("couples").select("*").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).eq("status", "linked").maybeSingle();
      if (!c) { router.replace("/onboarding"); return; }
      setCouple(c);

      await supabase.rpc("ensure_today_prompt");
      const today = new Date().toISOString().split("T")[0];
      const { data: dp } = await supabase.from("daily_prompts").select("*").eq("prompt_date", today).single();
      if (!dp) { toast.error("No prompt today"); router.back(); return; }
      setPrompt(dp);

      const { data: existing } = await supabase.from("submissions").select("id").eq("couple_id", c.id).eq("prompt_id", dp.id).eq("user_id", user.id).maybeSingle();
      if (existing) { setAlreadySubmitted(true); toast.error("Already submitted today!"); router.replace("/today"); }
    })();
  }, []);

  const openPicker = (source: "camera" | "library") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (source === "camera") input.setAttribute("capture", "environment");

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1080 / bitmap.width, 1080 / bitmap.height, 1);
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      // Square crop
      const sq = document.createElement("canvas");
      const crop = Math.min(canvas.width, canvas.height);
      sq.width = crop; sq.height = crop;
      const ox = (canvas.width - crop) / 2;
      const oy = (canvas.height - crop) / 2;
      sq.getContext("2d")!.drawImage(canvas, ox, oy, crop, crop, 0, 0, crop, crop);

      setPhotoDataUrl(sq.toDataURL("image/jpeg", 0.9));
      setStage("edit");
    };
    input.click();
  };

  const submitMeme = async () => {
    if (!photoDataUrl || !couple || !prompt || !user) return;
    setStage("uploading");
    setUploadProgress("Burning text into your meme…");

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = photoDataUrl;
      });

      const canvas = canvasRef.current!;
      const SIZE = 1080;
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);

      const drawMemeText = (text: string, y: number) => {
        if (!text.trim()) return;
        const fontSize = Math.floor(SIZE * 0.065);
        ctx.font = `bold ${fontSize}px Impact, "Arial Black", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = y < SIZE / 2 ? "top" : "bottom";
        const upper = text.toUpperCase();
        ctx.strokeStyle = "#000"; ctx.lineWidth = fontSize * 0.15; ctx.lineJoin = "round";
        ctx.strokeText(upper, SIZE / 2, y);
        ctx.fillStyle = "#fff";
        ctx.fillText(upper, SIZE / 2, y);
      };

      drawMemeText(topText, SIZE * 0.04);
      drawMemeText(botText, SIZE * 0.96);

      setUploadProgress("Uploading…");
      const blob = await new Promise<Blob>((res, rej) => {
        canvas.toBlob(b => b ? res(b) : rej(new Error("blob failed")), "image/jpeg", 0.9);
      });

      const filePath = `${couple.id}/${prompt.id}/${user.id}.jpg`;
      const { error: upErr } = await supabase.storage.from("memes").upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      setUploadProgress("Saving…");
      const { error: insErr } = await supabase.from("submissions").insert({
        couple_id: couple.id, prompt_id: prompt.id, user_id: user.id,
        image_url: filePath, top_text: topText.trim() || null, bottom_text: botText.trim() || null,
      });
      if (insErr) throw insErr;

      setStage("done");
      toast.success("Meme submitted! 🎉");

      const partnerId = couple.user_a === user.id ? couple.user_b : couple.user_a;
      if (partnerId) {
        fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partner_id: partnerId, title: "Your partner just submitted! 👀", message: "Make your meme to unlock the reveal!", url: "/today" })
        }).catch(() => {});
      }

      setTimeout(() => router.replace("/today"), 1500);
    } catch (err: any) {
      console.error("Submit error:", err);
      toast.error("Failed to submit. Try again.");
      setStage("edit");
    }
  };

  if (alreadySubmitted) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span className="animate-bounce-load" style={{ fontSize: 48 }}>📸</span>
    </div>
  );

  const memeTextStyle = (pos: "top" | "bottom") => ({
    position: "absolute" as const,
    [pos === "top" ? "top" : "bottom"]: 12,
    left: 12, right: 12, textAlign: "center" as const,
    textTransform: "uppercase" as const, lineHeight: 1.1,
    fontFamily: "Impact, 'Arial Black', sans-serif",
    fontSize: "clamp(16px, 5vw, 28px)", color: "#fff",
    textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 0 #000",
    wordBreak: "break-word" as const,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#241B4D" }}>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* ===== PICK STAGE ===== */}
      {stage === "pick" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 20, textAlign: "center" }}>
          <button onClick={() => router.back()} aria-label="Back to today's prompt" style={{ position: "absolute", top: 16, left: 16, padding: 10, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 14, fontSize: 16, color: "#fff", cursor: "pointer" }}>←</button>

          {prompt && (
            <div className="sticker-pill" style={{ background: "#F5B301", padding: "6px 18px" }}>
              <span className="font-display" style={{ fontSize: 13, fontWeight: 700, color: "#241B4D" }}>&ldquo;{prompt.title}&rdquo;</span>
            </div>
          )}

          <span className="animate-bounce-load" style={{ fontSize: 72 }}>📸</span>

          <div>
            <h2 className="font-display" style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: 0 }}>Take your meme photo</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
              {prompt?.description || "Snap a photo that matches the prompt!"}
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", maxWidth: 300, margin: "12px auto 0", lineHeight: 1.5 }}>
              Your photo stays hidden from your partner until you both submit. Choose a new photo or one from your library.
            </p>
          </div>

          <button onClick={() => openPicker("camera")} className="sticker font-display"
            style={{ width: "100%", maxWidth: 320, padding: 18, fontSize: 18, fontWeight: 700, color: "#fff", background: "#FF5C8A", cursor: "pointer", transition: "transform 0.15s" }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96) rotate(-1deg)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            📸 Open camera
          </button>

          <button onClick={() => openPicker("library")} className="font-display"
            style={{ width: "100%", maxWidth: 320, padding: "13px 18px", fontSize: 15, fontWeight: 700, color: "#fff", background: "transparent", border: "2px solid rgba(255,255,255,0.45)", borderRadius: 16, cursor: "pointer" }}>
            🖼️ Choose from library
          </button>

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", maxWidth: 280, lineHeight: 1.45 }}>If camera access is unavailable, choosing from your library works too.</p>
        </div>
      )}

      {/* ===== EDIT STAGE ===== */}
      {stage === "edit" && photoDataUrl && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px", flexShrink: 0 }}>
            <button onClick={() => { setPhotoDataUrl(null); setStage("pick"); }} className="sticker-sm font-display"
              style={{ padding: "8px 16px", background: "#fff", borderRadius: 14, fontSize: 13, fontWeight: 700, color: "#241B4D", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              🔄 Retake
            </button>
            {prompt && (
              <span className="sticker-pill" style={{ background: "#F5B301", padding: "4px 14px", fontSize: 12, fontWeight: 700, color: "#241B4D" }}>&ldquo;{prompt.title}&rdquo;</span>
            )}
            <button onClick={() => router.back()} style={{ padding: 8, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 12, fontSize: 14, color: "#fff", cursor: "pointer" }}>✕</button>
          </div>

          {/* Photo preview */}
          <div style={{ flex: 1, margin: "0 16px", position: "relative", overflow: "hidden", borderRadius: 24, border: "2px solid rgba(255,255,255,0.2)" }}>
            <img src={photoDataUrl} alt="Your meme" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {topText && <div style={memeTextStyle("top")}>{topText}</div>}
            {botText && <div style={memeTextStyle("bottom")}>{botText}</div>}
          </div>

          {/* Text inputs */}
          <div style={{ padding: "12px 16px 8px", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <input value={topText} onChange={(e) => setTopText(e.target.value)} placeholder="TOP TEXT (optional)" maxLength={60}
              style={{ width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 14, boxShadow: "2px 2px 0 #241B4D", outline: "none" }} />
            <input value={botText} onChange={(e) => setBotText(e.target.value)} placeholder="BOTTOM TEXT (optional)" maxLength={60}
              style={{ width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 14, boxShadow: "2px 2px 0 #241B4D", outline: "none" }} />
          </div>

          {/* Submit */}
          <div style={{ padding: "4px 16px 24px", flexShrink: 0 }}>
            <button onClick={submitMeme} className="sticker font-display"
              style={{ width: "100%", padding: 18, fontSize: 17, fontWeight: 700, color: "#fff", background: "#FF5C8A", cursor: "pointer", transition: "transform 0.15s" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              🚀 Submit meme
            </button>
          </div>
        </>
      )}

      {/* ===== UPLOADING ===== */}
      {stage === "uploading" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <span className="animate-bounce-load" style={{ fontSize: 56 }}>📸</span>
          <p className="font-display" style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Submitting your meme…</p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{uploadProgress}</p>
        </div>
      )}

      {/* ===== DONE ===== */}
      {stage === "done" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <span className="animate-bounce-load" style={{ fontSize: 64 }}>🎉</span>
          <p className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Meme submitted!</p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>Heading back…</p>
        </div>
      )}
    </div>
  );
}
