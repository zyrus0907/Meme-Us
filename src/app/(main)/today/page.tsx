"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerPushNotifications } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Profile, Couple, DailyPrompt, Round } from "@/lib/types";
import { toast } from "sonner";

type TodayState = "loading" | "no-prompt" | "not-submitted" | "waiting" | "unlocked";

export default function TodayPage() {
  const [state, setState] = useState<TodayState>("loading");
  const { colors } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [prompt, setPrompt] = useState<DailyPrompt | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");
  const [showMore, setShowMore] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      setTimeLeft(`${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, []);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(prof);

    const { data: c } = await supabase.from("couples").select("*").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).eq("status", "linked").maybeSingle();
    if (!c) { router.replace("/onboarding"); return; }
    setCouple(c);

    const { data: s } = await supabase.rpc("current_streak", { c: c.id });
    setStreak(s ?? 0);

    const partnerId = c.user_a === user.id ? c.user_b : c.user_a;
    const { data: pp } = await supabase.from("profiles").select("*").eq("id", partnerId).single();
    setPartner(pp);

    try { await fetch("/api/generate-prompt", { method: "POST" }); } catch {}
    const today = new Date().toISOString().split("T")[0];
    let { data: dp } = await supabase.from("daily_prompts").select("*").eq("prompt_date", today).maybeSingle() as any;
    if (!dp) {
      await supabase.rpc("ensure_today_prompt");
      const { data: dp2 } = await supabase.from("daily_prompts").select("*").eq("prompt_date", today).single();
      dp = dp2;
    }
    if (!dp) { setState("no-prompt"); return; }
    setPrompt(dp);

    const { data: mySub } = await supabase.from("submissions").select("*").eq("couple_id", c.id).eq("prompt_id", dp.id).eq("user_id", user.id).maybeSingle();
    const { data: rd } = await supabase.from("rounds").select("*").eq("couple_id", c.id).eq("prompt_id", dp.id).maybeSingle();
    setRound(rd);

    if (!mySub) setState("not-submitted");
    else if (rd?.submitted_count === 2) setState("unlocked");
    else setState("waiting");

    registerPushNotifications().catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!couple || !prompt) return;
    const channel = supabase.channel(`round-${couple.id}-${prompt.id}`).on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `couple_id=eq.${couple.id}` }, (payload: any) => {
      if (payload.new?.prompt_id === prompt.id) { setRound(payload.new); if (payload.new.submitted_count === 2) setState("unlocked"); }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [couple?.id, prompt?.id]);

  const [showLogout, setShowLogout] = useState(false);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  const shareReminder = async () => {
    const message = `Your meme is in \u2014 make yours to unlock today\'s Meme Us reveal before the timer runs out!`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Meme Us is waiting", text: message });
        return;
      }

      await navigator.clipboard.writeText(message);
      toast.success("Reminder copied \u2014 send it to your partner!");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn\'t open sharing. Try again in a moment.");
    }
  };

  const catEmoji = (c: string) => c === "color" ? "🎨" : c === "sentimental" ? "💞" : "🫠";
  const catColor = (c: string) => c === "color" ? colors.mustard : c === "sentimental" ? colors.pink : colors.grape;
  const partnerName = partner?.display_name || "your partner";

  // Shared styles using theme colors
  const cardStyle = { background: colors.bgCard, border: `2px solid ${colors.border}`, borderRadius: 20, boxShadow: `4px 4px 0 ${colors.shadow}` };
  const cardSmStyle = { background: colors.bgCard, border: `2px solid ${colors.border}`, borderRadius: 20, boxShadow: `2px 2px 0 ${colors.shadow}` };
  const pillStyle = { border: `2px solid ${colors.border}`, borderRadius: 999, boxShadow: `2px 2px 0 ${colors.shadow}` };

  if (state === "loading") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span className="animate-float" style={{ fontSize: 48 }}>😂</span>
        <span className="font-display" style={{ fontSize: 14, color: colors.muted, fontWeight: 600 }}>Loading today&apos;s prompt...</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ ...cardStyle, width: 40, height: 40, borderRadius: 14, background: colors.pink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, transform: "rotate(-6deg)" }}>
            😂
          </div>
          <span className="font-display" style={{ fontSize: 22, fontWeight: 700, color: colors.ink }}>Meme Us</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {streak > 0 && (
            <div style={{ ...pillStyle, background: colors.cream, padding: "5px 14px", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 13 }}>🔥</span>
              <span className="font-display" style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>{streak}</span>
            </div>
          )}
          <ThemeToggle />
          <button onClick={() => setShowLogout(true)} aria-label="Sign out" title="Sign out" style={{ ...cardSmStyle, padding: 8, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <span style={{ fontSize: 14 }}>🚪</span>
          </button>
        </div>
      </div>

      {/* GREETING */}
      <div style={{ padding: "0 20px 10px" }}>
        <p style={{ fontSize: 14, color: colors.muted, margin: 0 }}>
          Hi <strong style={{ color: colors.ink }}>{profile?.display_name}</strong> 👋 — you &amp; <strong style={{ color: colors.ink }}>{partnerName}</strong>
        </p>
      </div>

      {/* SCROLLABLE */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 32px" }} className="no-bar">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {state === "no-prompt" && (
            <div style={{ ...cardStyle, padding: 32, textAlign: "center" }} className="animate-pop-in">
              <div style={{ fontSize: 48, marginBottom: 12 }}>🌙</div>
              <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>No prompt yet today</p>
              <p style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>Check back shortly — refreshes at midnight UTC.</p>
            </div>
          )}

          {/* PROMPT CARD */}
          {prompt && (
            <div className="animate-pop-in" style={{ ...cardStyle, padding: 0, overflow: "hidden", transform: "rotate(-0.6deg)", boxShadow: `6px 6px 0 ${colors.shadow}` }}>
              <div style={{ background: catColor(prompt.category), padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ ...pillStyle, background: colors.bgCard, padding: "4px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12 }}>⚡</span>
                  <span className="font-display" style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>TODAY&apos;S PROMPT</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ ...pillStyle, background: colors.bgCard, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: colors.ink }}>
                    {catEmoji(prompt.category)} {prompt.category}
                  </span>
                  <span style={{ ...pillStyle, background: colors.bgCard, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: colors.ink }}>
                    ⏳ {timeLeft}
                  </span>
                </div>
              </div>

              <div style={{ padding: "20px 20px 24px" }}>
                <h2 className="font-display" style={{ fontSize: 28, fontWeight: 700, color: colors.ink, margin: 0, lineHeight: 1.2 }}>
                  &ldquo;{prompt.title}&rdquo;{" "}
                  <span className="animate-wiggle">{catEmoji(prompt.category)}</span>
                </h2>
                <p style={{ fontSize: 14, color: colors.muted, marginTop: 10, lineHeight: 1.6 }}>
                  {prompt.description}
                </p>

                {state === "not-submitted" && (
                  <button onClick={() => router.push("/create")} className="font-display" style={{ ...cardStyle, marginTop: 20, width: "100%", padding: 18, fontSize: 17, fontWeight: 700, color: "#fff", background: colors.pink, cursor: "pointer", transition: "transform 0.15s" }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96) rotate(-1deg)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    📸 Make your meme
                  </button>
                )}

                {state === "waiting" && (
                  <div style={{ ...cardStyle, marginTop: 20, background: colors.cream, padding: 20, textAlign: "center", transform: "rotate(0.5deg)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>🔒</span>
                      <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>You&apos;ve submitted!</span>
                    </div>
                    <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>
                      Waiting for <strong style={{ color: colors.ink }}>{partnerName}</strong> to post theirs. The reveal stays locked until you both submit.
                    </p>
                    <p style={{ fontSize: 12, color: colors.muted, margin: "10px 0 0" }}>
                      This round closes in {timeLeft}.
                    </p>
                    <button onClick={shareReminder} className="font-display" style={{ ...cardSmStyle, marginTop: 14, padding: "10px 14px", borderRadius: 14, background: colors.bgCard, color: colors.ink, fontSize: 13, fontWeight: 700 }}>
                      💌 Send a playful reminder
                    </button>
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <span className="animate-pulse-dot" style={{ width: 8, height: 8, background: colors.pink, borderRadius: "50%", display: "inline-block" }} />
                      <span style={{ fontSize: 12, color: colors.muted }}>Listening…</span>
                    </div>
                  </div>
                )}

                {state === "unlocked" && (
                  <button onClick={() => router.push(`/reveal/${prompt.prompt_date}`)} className="font-display" style={{ ...cardStyle, marginTop: 20, width: "100%", padding: 18, fontSize: 17, fontWeight: 700, color: "#fff", background: colors.grape, cursor: "pointer", transition: "transform 0.15s" }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    ✨ See the reveal! 💞
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ROUND STATUS */}
          {prompt && state !== "not-submitted" && round && (
            <div className="animate-pop-in" style={{ ...cardStyle, padding: 18, transform: "rotate(0.4deg)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span className="font-display" style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Round status</span>
                <span style={{ ...pillStyle, background: round.submitted_count === 2 ? colors.mint : colors.cream, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: round.submitted_count === 2 ? "#fff" : colors.ink }}>
                  {round.submitted_count}/2 submitted
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ ...cardSmStyle, background: colors.mintLight, padding: 14, textAlign: "center", borderRadius: 16 }}>
                  <div style={{ fontSize: 11, color: colors.muted }}>You</div>
                  <div style={{ fontSize: 24, margin: "6px 0 2px" }}>✅</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>Submitted</div>
                </div>
                <div style={{ ...cardSmStyle, background: round.submitted_count === 2 ? colors.mintLight : colors.cream, padding: 14, textAlign: "center", borderRadius: 16 }}>
                  <div style={{ fontSize: 11, color: colors.muted }}>{partnerName}</div>
                  <div style={{ fontSize: 24, margin: "6px 0 2px" }}>{round.submitted_count === 2 ? "✅" : "⏳"}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>{round.submitted_count === 2 ? "Submitted" : "Pending…"}</div>
                </div>
              </div>
            </div>
          )}

          {/* PARTNER BANNER */}
          {state === "not-submitted" && round && round.submitted_count >= 1 && (
            <button onClick={() => router.push("/create")} className="animate-pop-in" style={{ ...cardStyle, width: "100%", background: colors.pinkLight, padding: 18, display: "flex", alignItems: "center", gap: 14, textAlign: "left", borderColor: colors.pink, cursor: "pointer", transition: "transform 0.15s" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <span style={{ fontSize: 28 }}>👀</span>
              <div style={{ flex: 1 }}>
                <p className="font-display" style={{ fontSize: 14, fontWeight: 700, color: colors.ink, margin: 0 }}>{partnerName} already submitted!</p>
                <p style={{ fontSize: 12, color: colors.muted, margin: "3px 0 0" }}>Make yours to unlock the reveal. No peeking!</p>
              </div>
              <span style={{ fontSize: 16, color: colors.pink }}>→</span>
            </button>
          )}

          <button onClick={() => setShowMore((value) => !value)} className="font-display" style={{ ...cardSmStyle, width: "100%", padding: "13px 16px", background: colors.bgCardAlt, color: colors.ink, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>More to play &amp; memories</span>
            <span aria-hidden="true">{showMore ? "−" : "+"}</span>
          </button>

          {showMore && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* BINGO CARD */}
          <button onClick={() => router.push("/bingo")} className="animate-pop-in" style={{ ...cardStyle, width: "100%", background: colors.grapeLight, padding: 18, display: "flex", alignItems: "center", gap: 14, textAlign: "left", borderColor: colors.grape, cursor: "pointer", transition: "transform 0.15s", transform: "rotate(-0.5deg)" }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <span style={{ fontSize: 32 }}>🎲</span>
            <div style={{ flex: 1 }}>
              <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: colors.ink, margin: 0 }}>Weekly Bingo</p>
              <p style={{ fontSize: 12, color: colors.muted, margin: "3px 0 0" }}>9 micro-prompts. Fill a row to win. Tap to play!</p>
            </div>
            <span style={{ fontSize: 16, color: colors.grape }}>→</span>
          </button>

          {/* FLASH HUNT CARD */}
          <button onClick={() => router.push("/flash-hunt")} className="animate-pop-in" style={{ ...cardStyle, width: "100%", background: "linear-gradient(135deg, #241B4D, #6C5CE7)", padding: 18, display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", transition: "transform 0.15s", transform: "rotate(0.5deg)" }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <span style={{ fontSize: 32 }}>⚡</span>
            <div style={{ flex: 1 }}>
              <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 }}>Flash Hunt</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: "3px 0 0" }}>Random speed challenges. 10 min. Fastest wins!</p>
            </div>
            <span style={{ fontSize: 16, color: "#F5B301" }}>→</span>
          </button>

          {/* ROOMS CARD */}
          <button onClick={() => router.push("/rooms")} className="animate-pop-in" style={{ ...cardStyle, width: "100%", background: colors.mintLight, padding: 18, display: "flex", alignItems: "center", gap: 14, textAlign: "left", borderColor: colors.mint, cursor: "pointer", transition: "transform 0.15s" }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <span style={{ fontSize: 32 }}>🏠</span>
            <div style={{ flex: 1 }}>
              <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: colors.ink, margin: 0 }}>Rooms</p>
              <p style={{ fontSize: 12, color: colors.muted, margin: "3px 0 0" }}>Play with friends & groups. Create or join!</p>
            </div>
            <span style={{ fontSize: 16, color: colors.mint }}>→</span>
          </button>

          {/* QUICK LINKS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button onClick={() => router.push("/history")} style={{ ...cardStyle, padding: 20, textAlign: "left", cursor: "pointer", transition: "transform 0.15s" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>📒</div>
              <div className="font-display" style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>History</div>
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Last 14 rounds</div>
            </button>
            <button onClick={() => router.push("/settings")} style={{ ...cardStyle, padding: 20, textAlign: "left", cursor: "pointer", transition: "transform 0.15s" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
              <div className="font-display" style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Settings</div>
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Account &amp; data</div>
            </button>
          </div>

          {/* STREAK */}
          {streak > 0 && (
            <div className="animate-pop-in" style={{ ...cardSmStyle, background: colors.mustardLight, padding: 14, textAlign: "center", transform: "rotate(0.8deg)" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: colors.ink, margin: 0 }}>
                🔥 {streak} day streak! {streak >= 7 ? "You two are unstoppable!" : streak >= 3 ? "Keep it going!" : "Just getting started!"}
              </p>
            </div>
          )}
          </div>}

        </div>
      </div>

      {/* Logout confirmation */}
      {showLogout && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(36,27,77,0.5)" }} onClick={() => setShowLogout(false)}>
          <div style={{ width: "100%", maxWidth: 340, background: "#FFF8EC", border: "2px solid #241B4D", borderRadius: 28, padding: 24, boxShadow: "6px 6px 0 #241B4D" }} onClick={(e: any) => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>🚪</span>
              <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#241B4D", margin: "8px 0 4px" }}>Sign out?</h3>
              <p style={{ fontSize: 13, color: "#8A84A3" }}>You can always sign back in.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowLogout(false)} className="font-display" style={{ flex: 1, padding: 14, fontSize: 14, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 16, boxShadow: "3px 3px 0 #241B4D", cursor: "pointer" }}>Cancel</button>
              <button onClick={signOut} className="font-display" style={{ flex: 1, padding: 14, fontSize: 14, fontWeight: 700, color: "#fff", background: "#FF5C8A", border: "2px solid #241B4D", borderRadius: 16, boxShadow: "3px 3px 0 #241B4D", cursor: "pointer" }}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
