"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");
  const supabase = createClient();

  const signIn = async (provider: "google" | "apple") => {
    setLoading(provider);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + "/auth/callback" },
    });
    if (error) { setError("Something went wrong. Try again."); setLoading(null); }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px" }}>
      {/* Logo */}
      <div className="animate-pop-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 48 }}>
        <div className="sticker" style={{ width: 88, height: 88, borderRadius: 28, background: "#FF5C8A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, transform: "rotate(-6deg)" }}>
          😂
        </div>
        <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: "#241B4D", margin: 0 }}>Meme Us</h1>
        <p style={{ fontSize: 14, color: "#8A84A3", textAlign: "center", maxWidth: 260, lineHeight: 1.5, margin: 0 }}>
          A daily meme game for you and your person. One prompt. Two memes. Blind reveal. 💞
        </p>
      </div>

      {/* Buttons */}
      <div className="animate-pop-in" style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12, animationDelay: "100ms" }}>
        <button
          onClick={() => signIn("google")}
          disabled={!!loading}
          className="sticker font-display"
          style={{
            width: "100%", padding: "16px 24px", fontSize: 16, fontWeight: 700,
            color: "#241B4D", background: "#fff", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, border: "2px solid #241B4D",
            transition: "transform 0.15s", opacity: loading ? 0.6 : 1,
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading === "google" ? "Signing in..." : "Continue with Google"}
        </button>

        <button
          onClick={() => signIn("apple")}
          disabled={!!loading}
          className="sticker font-display"
          style={{
            width: "100%", padding: "16px 24px", fontSize: 16, fontWeight: 700,
            color: "#fff", background: "#241B4D", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, borderColor: "#241B4D",
            transition: "transform 0.15s", opacity: loading ? 0.6 : 1,
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continue with Apple
        </button>
      </div>

      {error && <p style={{ marginTop: 16, fontSize: 14, color: "#FF5C8A", fontWeight: 700, textAlign: "center" }}>{error}</p>}

      <p className="animate-pop-in" style={{ marginTop: 32, fontSize: 12, color: "#B7B0D9", textAlign: "center", lineHeight: 1.6, animationDelay: "200ms" }}>
        By continuing, you confirm you&apos;re 18 or older and agree to our{" "}
        <a href="/terms" style={{ color: "#B7B0D9", textDecoration: "underline" }}>Terms</a> &amp;{" "}
        <a href="/privacy" style={{ color: "#B7B0D9", textDecoration: "underline" }}>Privacy Policy</a>.
      </p>
    </div>
  );
}
