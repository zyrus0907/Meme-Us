"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStyles } from "@/lib/styles";
import { Browser } from "@capacitor/browser";
import { isNativeApp } from "@/lib/native";

export default function LoginPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const s = useStyles();
  const supabase = createClient();

  useEffect(() => {
    const reset = () => setLoading(null);
    const resetWhenVisible = () => {
      if (document.visibilityState === "visible") reset();
    };
    window.addEventListener("focus", reset);
    document.addEventListener("visibilitychange", resetWhenVisible);
    return () => {
      window.removeEventListener("focus", reset);
      document.removeEventListener("visibilitychange", resetWhenVisible);
    };
  }, []);

  const signIn = async (provider: "google" | "apple") => {
    setLoading(provider); setError("");
    const native = isNativeApp();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: native ? "memeus://auth/callback" : window.location.origin + "/auth/callback",
        skipBrowserRedirect: native,
      },
    });
    if (error) {
      setError(error.message?.includes("not enabled") ? `${provider === "apple" ? "Apple" : "Google"} sign-in isn't set up yet.` : "Something went wrong.");
      setLoading(null);
      return;
    }
    if (native && data.url) {
      try {
        await Browser.open({ url: data.url });
      } catch (browserError) {
        console.error("Could not open native sign-in:", browserError);
        setError("Could not open sign-in. Please try again.");
        setLoading(null);
      }
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px" }}>
      <div className="animate-pop-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 48 }}>
        <div style={{ ...s.card, width: 96, height: 96, borderRadius: 28, background: s.colors.pink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, transform: "rotate(-6deg)" } as any}>😂</div>
        <h1 className="font-display" style={{ fontSize: 42, fontWeight: 700, color: s.ink, margin: 0 }}>Meme Us</h1>
        <p style={{ fontSize: 14, color: s.muted, textAlign: "center", maxWidth: 260, lineHeight: 1.6, margin: 0 }}>A daily meme game for you and your person. One prompt. Two memes. Blind reveal. 💞</p>
      </div>
      <div className="animate-pop-in" style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 14, animationDelay: "100ms" }}>
        <button onClick={() => signIn("google")} disabled={!!loading} className="font-display"
          style={{ ...s.btn(s.colors.bgCard, s.ink), opacity: loading && loading !== "google" ? 0.5 : 1 } as any}
          onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          {loading === "google" ? "Signing in..." : "Continue with Google"}
        </button>
        <button onClick={() => signIn("apple")} disabled={!!loading} className="font-display"
          style={{ ...s.btn("#241B4D", "#fff"), boxShadow: "4px 4px 0 #000", opacity: loading && loading !== "apple" ? 0.5 : 1 } as any}
          onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          {loading === "apple" ? "Signing in..." : "Continue with Apple"}
        </button>
      </div>
      {error && (
        <div className="animate-pop-in" style={{ marginTop: 16, ...s.cardSm, padding: "12px 20px", borderColor: s.colors.pink, maxWidth: 320, background: s.colors.pinkLight } as any}>
          <p style={{ fontSize: 13, color: s.ink, fontWeight: 700, textAlign: "center", margin: 0 }}>{error}</p>
        </div>
      )}
      <p className="animate-pop-in" style={{ marginTop: 32, fontSize: 12, color: s.muted, textAlign: "center", lineHeight: 1.6, animationDelay: "200ms", opacity: 0.7 }}>
        By continuing, you agree to our <a href="/terms" style={{ color: s.muted, textDecoration: "underline" }}>Terms</a> &amp; <a href="/privacy" style={{ color: s.muted, textDecoration: "underline" }}>Privacy</a>. You&#39;ll confirm your age next.
      </p>
    </div>
  );
}
