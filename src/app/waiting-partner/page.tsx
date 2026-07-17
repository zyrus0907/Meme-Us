"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useStyles } from "@/lib/styles";
import { toast } from "sonner";

export default function WaitingPartnerPage() {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const s = useStyles();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let channel: any = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data: couple } = await supabase.from("couples").select("id, invite_code, status").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).in("status", ["pending", "linked"]).maybeSingle();
      if (!couple) { router.replace("/onboarding"); return; }
      if (couple.status === "linked") { router.replace("/today"); return; }
      setCode(couple.invite_code);
      setLoading(false);
      channel = supabase.channel(`couple-${couple.id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "couples", filter: `id=eq.${couple.id}` }, (payload: any) => {
        if (payload.new.status === "linked") { toast.success("Partner joined! 💞"); router.replace("/today"); }
      }).subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true); toast.success("Copied!"); setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the code. Try selecting it instead.");
    }
  };

  const shareInvite = async () => {
    if (!code) return;
    const message = `Join my Meme Us duo! We make one meme each day, then unlock the reveal together. My code is ${code}.`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my Meme Us duo", text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      toast.success("Invite message copied!");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't share the invite. Try copying the code instead.");
    }
  };

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-bounce-load" style={{ fontSize: 40 }}>💌</span></div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 28px", textAlign: "center", gap: 24 }}>
      <div className="animate-pop-in" style={{ position: "relative" }}>
        <div style={{ ...s.card, width: 100, height: 100, borderRadius: 32, background: s.colors.cream, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, transform: "rotate(-3deg)" } as any}>💌</div>
        <span className="animate-pulse-dot" style={{ position: "absolute", bottom: -4, right: -4, width: 18, height: 18, background: s.colors.pink, borderRadius: "50%", border: `2px solid ${s.colors.border}` }} />
      </div>
      <div className="animate-pop-in" style={{ animationDelay: "80ms" }}>
        <h2 className="font-display" style={{ fontSize: 26, fontWeight: 700, color: s.ink, margin: "0 0 8px" }}>Waiting for your partner</h2>
        <p style={{ fontSize: 14, color: s.muted, maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>Share this code. The moment they join, you&#39;ll be whisked to today&#39;s prompt.</p>
      </div>
      <button onClick={copyCode} className="animate-pop-in" style={{ ...s.card, padding: "24px 40px", borderRadius: 28, cursor: "pointer", transition: "transform 0.15s", animationDelay: "160ms" } as any}
        onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
        <div className="font-display" style={{ fontSize: 40, fontWeight: 700, color: s.ink, letterSpacing: "0.3em" }}>{code}</div>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: copied ? s.colors.mint : s.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {copied ? "✓ Copied!" : "📋 Tap to copy"}
        </div>
      </button>
      <button onClick={shareInvite} className="font-display animate-pop-in" style={{ ...s.card, width: "100%", maxWidth: 300, padding: 14, borderRadius: 16, background: s.colors.grape, color: "#fff", fontSize: 15, fontWeight: 700, animationDelay: "200ms" } as any}
        onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
        💌 Share invite
      </button>
      <div className="animate-pop-in" style={{ ...s.cardSm, background: s.colors.mustardLight, padding: "12px 18px", maxWidth: 300, borderRadius: 16, transform: "rotate(1deg)", animationDelay: "240ms" } as any}>
        <p style={{ fontSize: 12, fontWeight: 700, color: s.ink, lineHeight: 1.5, margin: 0 }}>
          💡 Text them: <em>&quot;daily meme battle. you and me. code: {code}&quot;</em>
        </p>
      </div>
      <p style={{ fontSize: 12, color: s.muted, display: "flex", alignItems: "center", gap: 8 }}>
        <span className="animate-pulse-dot" style={{ width: 8, height: 8, background: s.colors.mint, borderRadius: "50%", display: "inline-block" }} />
        Listening for your partner…
      </p>
    </div>
  );
}
