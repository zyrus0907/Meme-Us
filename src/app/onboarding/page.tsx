"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Step = "age" | "name" | "choice" | "create" | "join";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("age");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("display_name, age_confirmed_at").eq("id", user.id).single();
      if (profile?.age_confirmed_at) {
        if (profile.display_name) {
          setDisplayName(profile.display_name);
          const { data: couple } = await supabase.from("couples").select("id, status, invite_code").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).in("status", ["pending", "linked"]).maybeSingle();
          if (couple?.status === "linked") { router.replace("/today"); return; }
          if (couple?.status === "pending") { router.replace("/waiting-partner"); return; }
          setStep("choice");
        } else { setStep("name"); }
      }
    })();
  }, []);

  const confirmAge = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.from("profiles").update({ age_confirmed_at: new Date().toISOString() }).eq("id", userId);
    setLoading(false);
    if (error) {
      setError("We couldn't save your confirmation. Check your connection and try again.");
      return;
    }
    setStep("name");
  };

  const saveName = async () => {
    if (!displayName.trim() || !userId) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", userId);
    setLoading(false);
    if (error) {
      setError("We couldn't save your name. Check your connection and try again.");
      return;
    }
    setStep("choice");
  };

  const createCouple = async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.rpc("create_couple");
    setLoading(false);
    if (error) {
      setError(error.message?.includes("already_in_couple") ? "You're already in a couple." : "Couldn't create. Try again.");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setGeneratedCode(row.invite_code);
    setStep("create");
  };

  const joinCouple = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) { setError("Codes are 6 characters."); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.rpc("join_couple", { code });
    setLoading(false);
    if (error) {
      const m = error.message || "";
      if (m.includes("invalid_code")) setError("That code doesn't exist. Double-check with your partner.");
      else if (m.includes("couple_full")) setError("That couple already has two people.");
      else if (m.includes("already_in_couple")) setError("You're already in a couple.");
      else if (m.includes("cannot_join_own")) setError("You can't join your own couple.");
      else setError("Something went wrong. Try again.");
      return;
    }
    toast.success("You're linked! 💞");
    router.replace("/today");
  };

  const copyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success("Code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the code. Try selecting it instead.");
    }
  };

  const shareInvite = async () => {
    if (!generatedCode) return;
    const message = `Join my Meme Us duo! We make one meme each day, then unlock the reveal together. My code is ${generatedCode}.`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my Meme Us duo", text: message });
        toast.success("Invite ready to send!");
        return;
      }
      await navigator.clipboard.writeText(message);
      toast.success("Invite message copied!");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't share the invite. Try copying the code instead.");
    }
  };

  const S = {
    page: { flex: 1, display: "flex" as const, flexDirection: "column" as const, alignItems: "center" as const, justifyContent: "center" as const, padding: "40px 28px", gap: 24, textAlign: "center" as const },
    icon: (bg: string, rotate = 0) => ({ width: 100, height: 100, borderRadius: 32, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, transform: `rotate(${rotate}deg)`, border: "2px solid #241B4D", boxShadow: "5px 5px 0 #241B4D" }),
    title: { fontSize: 28, fontWeight: 700, color: "#241B4D", margin: 0 },
    subtitle: { fontSize: 14, color: "#8A84A3", maxWidth: 300, margin: "0 auto", lineHeight: 1.6 },
    input: { width: "100%", maxWidth: 320, padding: "16px 20px", fontSize: 16, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 20, boxShadow: "4px 4px 0 #241B4D", outline: "none", textAlign: "center" as const },
    btn: (bg: string, color = "#fff") => ({ width: "100%", maxWidth: 320, padding: "18px 24px", fontSize: 16, fontWeight: 700, color, background: bg, border: "2px solid #241B4D", borderRadius: 20, boxShadow: "4px 4px 0 #241B4D", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "transform 0.15s", opacity: loading ? 0.6 : 1 }),
    card: (bg: string) => ({ width: "100%", maxWidth: 320, padding: 20, background: bg, border: "2px solid #241B4D", borderRadius: 22, boxShadow: "4px 4px 0 #241B4D", textAlign: "left" as const, cursor: "pointer", transition: "transform 0.15s" }),
    codeBox: { padding: "28px 40px", background: "#fff", border: "2px solid #241B4D", borderRadius: 28, boxShadow: "6px 6px 0 #241B4D", cursor: "pointer", transition: "transform 0.15s" },
  };

  const press = (e: any) => (e.currentTarget.style.transform = "scale(0.96)");
  const release = (e: any) => (e.currentTarget.style.transform = "scale(1)");

  return (
    <div style={S.page}>
      {/* Back button for sub-steps */}
      {(step === "create" || step === "join") && (
        <button onClick={() => { setStep("choice"); setError(null); setInviteCode(""); }} style={{ position: "absolute" as const, top: 20, left: 20, padding: 10, background: "#fff", border: "2px solid #241B4D", borderRadius: 14, boxShadow: "2px 2px 0 #241B4D", cursor: "pointer", fontSize: 16 }}>
          ←
        </button>
      )}

      {/* ===== AGE GATE ===== */}
      {step === "age" && (
        <>
          <div className="animate-pop-in" style={S.icon("#F5B301", 4)}>🔞</div>
          <div className="animate-pop-in" style={{ animationDelay: "60ms" }}>
            <h2 className="font-display" style={S.title}>Quick age check</h2>
            <p style={{ ...S.subtitle, marginTop: 10 }}>
              Meme Us is for adults only (18+). By continuing you confirm you meet the age requirement in your region.
            </p>
          </div>
          <button onClick={confirmAge} disabled={loading} className="font-display animate-pop-in" style={{ ...S.btn("#241B4D"), animationDelay: "120ms" }}
            onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
            {loading ? "..." : "I'm 18 or older →"}
          </button>
          {error && <p role="alert" style={{ fontSize: 13, color: "#FF5C8A", fontWeight: 700, maxWidth: 300 }}>{error}</p>}
          <p style={{ fontSize: 12, color: "#B7B0D9" }}>
            See our <a href="/terms" style={{ color: "#B7B0D9", textDecoration: "underline" }}>Terms</a> for details.
          </p>
        </>
      )}

      {/* ===== NAME ===== */}
      {step === "name" && (
        <>
          <div className="animate-pop-in" style={S.icon("#FFE9F0", -3)}>✏️</div>
          <div className="animate-pop-in" style={{ animationDelay: "60ms" }}>
            <h2 className="font-display" style={S.title}>What should we call you?</h2>
            <p style={{ ...S.subtitle, marginTop: 8 }}>Your partner will see this name.</p>
          </div>
          <label htmlFor="display-name" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>Display name</label>
          <input id="display-name" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setError(null); }} placeholder="Your name" maxLength={24} autoComplete="nickname" autoFocus className="animate-pop-in" style={{ ...S.input, animationDelay: "120ms" }} />
          {error && <p role="alert" style={{ fontSize: 13, color: "#FF5C8A", fontWeight: 700, maxWidth: 300 }}>{error}</p>}
          <button onClick={saveName} disabled={!displayName.trim() || loading} className="font-display animate-pop-in" style={{ ...S.btn("#6C5CE7"), animationDelay: "180ms", opacity: !displayName.trim() ? 0.4 : 1 }}
            onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
            {loading ? "..." : "Continue →"}
          </button>
        </>
      )}

      {/* ===== CHOICE ===== */}
      {step === "choice" && (
        <>
          <div className="animate-pop-in">
            <h2 className="font-display" style={S.title}>Set up your duo 💞</h2>
            <p style={{ ...S.subtitle, marginTop: 8 }}>One of you creates, the other joins with the code.</p>
          </div>
          <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
            <button onClick={createCouple} disabled={loading} className="animate-pop-in" style={{ ...S.card("#FFE9F0"), animationDelay: "60ms" }}
              onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: "#FF5C8A", border: "2px solid #241B4D", boxShadow: "2px 2px 0 #241B4D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>👫</div>
                <div>
                  <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#241B4D" }}>Create a couple</div>
                  <div style={{ fontSize: 12, color: "#8A84A3", marginTop: 2 }}>Get a code to send your partner</div>
                </div>
              </div>
            </button>
            <button onClick={() => { setStep("join"); setError(null); }} disabled={loading} className="animate-pop-in" style={{ ...S.card("#EFEAFF"), animationDelay: "120ms" }}
              onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: "#6C5CE7", border: "2px solid #241B4D", boxShadow: "2px 2px 0 #241B4D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🤝</div>
                <div>
                  <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#241B4D" }}>Join with a code</div>
                  <div style={{ fontSize: 12, color: "#8A84A3", marginTop: 2 }}>Your partner already created one</div>
                </div>
              </div>
            </button>
          </div>
          {loading && <span className="animate-float" style={{ fontSize: 28 }}>⏳</span>}
          {error && <p style={{ fontSize: 13, color: "#FF5C8A", fontWeight: 700, maxWidth: 300 }}>{error}</p>}
        </>
      )}

      {/* ===== CREATE — Show code ===== */}
      {step === "create" && generatedCode && (
        <>
          <div className="animate-pop-in" style={S.icon("#FFF4D6", 3)}>🔗</div>
          <div className="animate-pop-in" style={{ animationDelay: "60ms" }}>
            <h2 className="font-display" style={S.title}>Your couple code</h2>
            <p style={{ ...S.subtitle, marginTop: 8 }}>Send this to your partner. Once they enter it, you&apos;re linked and today&apos;s prompt unlocks.</p>
          </div>
          <button onClick={copyCode} className="animate-pop-in" style={{ ...S.codeBox, animationDelay: "120ms" }}
            onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
            <div className="font-display" style={{ fontSize: 44, fontWeight: 700, color: "#241B4D", letterSpacing: "0.3em" }}>{generatedCode}</div>
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: copied ? "#2FC98C" : "#8A84A3", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {copied ? "✓ Copied!" : "📋 Tap to copy"}
            </div>
          </button>
          <div style={{ background: "#FFF4D6", border: "2px solid #241B4D", borderRadius: 18, boxShadow: "3px 3px 0 #241B4D", padding: "14px 20px", maxWidth: 320, transform: "rotate(1deg)" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#241B4D", lineHeight: 1.5, margin: 0 }}>
              💡 Text them: <em>&ldquo;daily meme battle. you and me. code: {generatedCode}&rdquo;</em>
            </p>
          </div>
          <button onClick={shareInvite} className="font-display" style={S.btn("#6C5CE7")}
            onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
            💌 Share invite
          </button>
          <button onClick={() => router.replace("/waiting-partner")} className="font-display" style={S.btn("#241B4D")}
            onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
            I&apos;ve sent it →
          </button>
        </>
      )}

      {/* ===== JOIN — Enter code ===== */}
      {step === "join" && (
        <>
          <div className="animate-pop-in" style={S.icon("#EFEAFF", -4)}>🤝</div>
          <div className="animate-pop-in" style={{ animationDelay: "60ms" }}>
            <h2 className="font-display" style={S.title}>Enter the code</h2>
            <p style={{ ...S.subtitle, marginTop: 8 }}>Your partner should have a 6-character code.</p>
          </div>
          <input
            aria-label="6-character couple code"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            value={inviteCode}
            onChange={(e) => { setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)); setError(null); }}
            placeholder="ABC123" maxLength={6} autoFocus
            className="animate-pop-in"
            style={{ ...S.input, fontSize: 32, letterSpacing: "0.25em", animationDelay: "120ms" }}
          />
          {error && <p role="alert" style={{ fontSize: 13, color: "#FF5C8A", fontWeight: 700, maxWidth: 300 }}>{error}</p>}
          <button onClick={joinCouple} disabled={inviteCode.length !== 6 || loading} className="font-display animate-pop-in" style={{ ...S.btn("#6C5CE7"), animationDelay: "180ms", opacity: inviteCode.length !== 6 ? 0.4 : 1 }}
            onMouseDown={press} onMouseUp={release} onMouseLeave={release}>
            {loading ? "..." : "Join couple →"}
          </button>
        </>
      )}
    </div>
  );
}
