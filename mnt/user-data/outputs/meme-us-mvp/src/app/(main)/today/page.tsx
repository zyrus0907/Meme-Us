"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, LogOut, Camera } from "lucide-react";

export default function TodayPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [couple, setCouple] = useState<any>(null);
  const [prompt, setPrompt] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setUser(user);

      // Fetch profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(prof);

      // Fetch couple
      const { data: c } = await supabase
        .from("couples")
        .select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .eq("status", "linked")
        .maybeSingle();

      if (!c) {
        router.replace("/onboarding");
        return;
      }
      setCouple(c);

      // Fetch partner profile
      const partnerId = c.user_a === user.id ? c.user_b : c.user_a;
      const { data: partnerProf } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", partnerId)
        .single();
      setPartner(partnerProf);

      // Ensure today's prompt exists and fetch it
      await supabase.rpc("ensure_today_prompt");
      const today = new Date().toISOString().split("T")[0];
      const { data: dp } = await supabase
        .from("daily_prompts")
        .select("*")
        .eq("prompt_date", today)
        .single();
      setPrompt(dp);

      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-muted" />
      </div>
    );
  }

  // Get current streak (displayed even before Step 5 streak logic)
  const streak = couple?.streak_count ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto no-bar">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="sticker bg-pink flex items-center justify-center text-lg"
            style={{ width: 36, height: 36, borderRadius: 12, transform: "rotate(-6deg)" }}
          >
            😂
          </div>
          <span className="text-xl font-bold font-display text-ink">
            Meme Us
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="sticker-pill bg-cream px-3 py-1 text-xs font-bold text-ink flex items-center gap-1">
            🔥 {streak}
          </span>
          <button
            onClick={signOut}
            className="sticker-sm bg-white p-2 transition-transform active:scale-90"
            style={{ borderRadius: 12 }}
          >
            <LogOut size={16} strokeWidth={2.5} className="text-muted" />
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div className="px-5 pb-2">
        <p className="text-sm text-muted">
          Hi <span className="font-bold text-ink">{profile?.display_name}</span>{" "}
          👋 — you &amp;{" "}
          <span className="font-bold text-ink">
            {partner?.display_name || "your partner"}
          </span>
        </p>
      </div>

      {/* Today's prompt */}
      <div className="px-5 flex-1 flex flex-col gap-4 pb-8">
        {prompt ? (
          <div
            className="sticker bg-white p-5 animate-pop-in"
            style={{ transform: "rotate(-0.6deg)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="sticker-pill bg-mustard px-3 py-1 text-xs font-bold text-ink">
                ⚡ TODAY&apos;S PROMPT
              </span>
              <span className="sticker-pill bg-cream px-2 py-1 text-xs font-bold text-muted">
                {prompt.category}
              </span>
            </div>
            <h2 className="text-2xl font-bold font-display text-ink leading-tight">
              &ldquo;{prompt.title}&rdquo;{" "}
              <span className="inline-block animate-wiggle">🫠</span>
            </h2>
            <p className="mt-2 text-sm text-muted leading-snug">
              {prompt.description}
            </p>
            {/* TODO(Step 4): wire this to /create */}
            <button
              onClick={() => {
                // TODO(Step 4): navigate to /create
                alert(
                  "Step 4 builds the camera + meme creator. Coming next!"
                );
              }}
              className="mt-4 w-full flex items-center justify-center gap-2 py-4 bg-pink text-white sticker font-display font-bold text-base transition-transform active:scale-95 hover:-translate-y-0.5"
            >
              <Camera size={20} strokeWidth={2.5} /> Make your meme
            </button>
          </div>
        ) : (
          <div className="sticker bg-white p-5 text-center">
            <p className="text-muted text-sm">
              No prompt yet today. Check back shortly.
            </p>
          </div>
        )}

        {/* Placeholder for submission state — built in Step 5 */}
        <div
          className="sticker bg-cream p-4 text-center animate-pop-in"
          style={{ animationDelay: "100ms", transform: "rotate(0.5deg)" }}
        >
          <p className="text-xs font-bold text-muted">
            📸 Submission &amp; blind reveal will appear here (Step 4 &amp; 5)
          </p>
        </div>
      </div>
    </div>
  );
}
