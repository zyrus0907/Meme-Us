"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Copy,
  Check,
  ArrowRight,
  Users,
  UserPlus,
  ChevronLeft,
} from "lucide-react";

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

  // Check existing state on mount
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, age_confirmed_at")
        .eq("id", user.id)
        .single();

      if (profile?.age_confirmed_at) {
        // Already confirmed age — check if they also have a name
        if (profile.display_name) {
          setDisplayName(profile.display_name);
          // Check if they already have a couple
          const { data: couple } = await supabase
            .from("couples")
            .select("id, status, invite_code")
            .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
            .in("status", ["pending", "linked"])
            .maybeSingle();

          if (couple?.status === "linked") {
            router.replace("/today");
            return;
          }
          if (couple?.status === "pending") {
            router.replace("/waiting-partner");
            return;
          }
          setStep("choice");
        } else {
          setStep("name");
        }
      }
      // else: show age gate (default)
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Age confirmation ---- */
  const confirmAge = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ age_confirmed_at: new Date().toISOString() })
      .eq("id", userId!);
    setLoading(false);

    if (error) {
      toast.error("Something went wrong. Try again.");
      return;
    }
    setStep("name");
  };

  /* ---- Save display name ---- */
  const saveName = async () => {
    const name = displayName.trim();
    if (!name) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", userId!);
    setLoading(false);

    if (error) {
      toast.error("Couldn't save your name. Try again.");
      return;
    }
    setStep("choice");
  };

  /* ---- Create couple ---- */
  const createCouple = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.rpc("create_couple");

    setLoading(false);
    if (error) {
      if (error.message?.includes("already_in_couple")) {
        setError("You're already in a couple. Sign out if you need to start fresh.");
      } else {
        setError("Couldn't create a couple. Try again.");
      }
      return;
    }

    // data is an array with one row: { couple_id, invite_code }
    const row = Array.isArray(data) ? data[0] : data;
    setGeneratedCode(row.invite_code);
    setStep("create");
  };

  /* ---- Join couple ---- */
  const joinCouple = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError("Codes are 6 characters. Check and try again.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.rpc("join_couple", { code });

    setLoading(false);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("invalid_code")) {
        setError("That code doesn't exist. Double-check with your partner.");
      } else if (msg.includes("couple_full")) {
        setError("That couple already has two people. One partner per code.");
      } else if (msg.includes("already_in_couple")) {
        setError("You're already in a couple.");
      } else if (msg.includes("cannot_join_own")) {
        setError("You can't join your own couple — send this code to your partner.");
      } else {
        setError("Something went wrong. Try again.");
      }
      return;
    }

    toast.success("You're linked! 💞");
    router.replace("/today");
  };

  /* ---- Copy code helper ---- */
  const copyCode = async () => {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    toast.success("Code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  /* ---- Render ---- */
  return (
    <div className="flex-1 flex flex-col px-6 py-10 overflow-y-auto no-bar">
      {/* Back button for sub-steps */}
      {(step === "create" || step === "join") && (
        <button
          onClick={() => {
            setStep("choice");
            setError(null);
            setInviteCode("");
          }}
          className="sticker-sm bg-white p-2 self-start mb-4 transition-transform active:scale-90"
          style={{ borderRadius: 12 }}
        >
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
      )}

      {/* ===== AGE GATE ===== */}
      {step === "age" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div
            className="sticker bg-mustard flex items-center justify-center text-5xl"
            style={{ width: 90, height: 90, borderRadius: 28, transform: "rotate(4deg)" }}
          >
            🔞
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-ink">
              Quick age check
            </h2>
            <p className="mt-2 text-sm text-muted leading-snug max-w-[280px] mx-auto">
              Meme Us is for adults only (18+). By continuing you confirm
              you meet the age requirement in your region.
            </p>
          </div>
          <button
            onClick={confirmAge}
            disabled={loading}
            className="w-full max-w-[300px] py-4 bg-ink text-white sticker font-display font-bold text-base transition-transform active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                I&apos;m 18 or older <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="text-xs text-muted">
            See our{" "}
            <a href="/terms" className="underline">
              Terms
            </a>{" "}
            for details.
          </p>
        </div>
      )}

      {/* ===== DISPLAY NAME ===== */}
      {step === "name" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div
            className="sticker bg-pink-light flex items-center justify-center text-5xl"
            style={{ width: 90, height: 90, borderRadius: 28, transform: "rotate(-3deg)" }}
          >
            ✏️
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-ink">
              What should we call you?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Your partner will see this name.
            </p>
          </div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={24}
            autoFocus
            className="w-full max-w-[300px] px-5 py-4 text-center text-lg font-bold sticker bg-white outline-none placeholder:text-muted/50 focus:shadow-sticker-lg transition-shadow"
          />
          <button
            onClick={saveName}
            disabled={!displayName.trim() || loading}
            className="w-full max-w-[300px] py-4 bg-grape text-white sticker font-display font-bold text-base transition-transform active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                Continue <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      )}

      {/* ===== CHOICE: Create or Join ===== */}
      {step === "choice" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div>
            <h2 className="text-2xl font-bold font-display text-ink">
              Set up your duo
            </h2>
            <p className="mt-2 text-sm text-muted max-w-[280px] mx-auto">
              One of you creates, the other joins with the code.
              That&apos;s it — one couple, two meme lords.
            </p>
          </div>

          <div className="w-full max-w-[320px] space-y-3">
            <button
              onClick={createCouple}
              disabled={loading}
              className="w-full text-left p-5 bg-pink-light sticker transition-transform active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                <span className="sticker bg-pink p-2.5 flex items-center justify-center" style={{ borderRadius: 14 }}>
                  <Users size={22} className="text-white" strokeWidth={2.5} />
                </span>
                <div>
                  <div className="font-bold font-display text-ink text-base">
                    Create a couple
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Get a code to send your partner
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setStep("join");
                setError(null);
              }}
              disabled={loading}
              className="w-full text-left p-5 bg-grape-light sticker transition-transform active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                <span className="sticker bg-grape p-2.5 flex items-center justify-center" style={{ borderRadius: 14 }}>
                  <UserPlus size={22} className="text-white" strokeWidth={2.5} />
                </span>
                <div>
                  <div className="font-bold font-display text-ink text-base">
                    Join with a code
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Your partner already created one
                  </div>
                </div>
              </div>
            </button>
          </div>

          {loading && (
            <Loader2 size={24} className="animate-spin text-muted mt-2" />
          )}
          {error && (
            <p className="text-sm text-pink font-bold max-w-[300px]">{error}</p>
          )}
        </div>
      )}

      {/* ===== CREATE — Show code ===== */}
      {step === "create" && generatedCode && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div
            className="sticker bg-mustard-light flex items-center justify-center text-5xl"
            style={{ width: 90, height: 90, borderRadius: 28, transform: "rotate(3deg)" }}
          >
            🔗
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-ink">
              Your couple code
            </h2>
            <p className="mt-2 text-sm text-muted max-w-[260px] mx-auto">
              Send this to your partner. Once they enter it, you&apos;re linked
              and today&apos;s prompt unlocks.
            </p>
          </div>

          {/* The code */}
          <button
            onClick={copyCode}
            className="group sticker bg-white px-8 py-5 transition-transform active:scale-95 hover:-translate-y-0.5"
            style={{ borderRadius: 24 }}
          >
            <div
              className="text-4xl font-bold font-display tracking-[0.3em] text-ink"
              style={{ letterSpacing: "0.3em" }}
            >
              {generatedCode}
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-muted group-hover:text-grape transition-colors">
              {copied ? (
                <>
                  <Check size={14} strokeWidth={3} className="text-mint" />{" "}
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} strokeWidth={2.5} /> Tap to copy
                </>
              )}
            </div>
          </button>

          <button
            onClick={() => router.replace("/waiting-partner")}
            className="w-full max-w-[300px] py-4 bg-ink text-white sticker font-display font-bold text-base transition-transform active:scale-95 flex items-center justify-center gap-2"
          >
            I&apos;ve sent it <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* ===== JOIN — Enter code ===== */}
      {step === "join" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div
            className="sticker bg-grape-light flex items-center justify-center text-5xl"
            style={{ width: 90, height: 90, borderRadius: 28, transform: "rotate(-4deg)" }}
          >
            🤝
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-ink">
              Enter the code
            </h2>
            <p className="mt-2 text-sm text-muted max-w-[260px] mx-auto">
              Your partner should have a 6-character code.
              Type it below.
            </p>
          </div>

          <input
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
              setError(null);
            }}
            placeholder="ABC123"
            maxLength={6}
            autoFocus
            className="w-full max-w-[260px] px-5 py-4 text-center text-3xl font-bold font-display tracking-[0.25em] sticker bg-white outline-none placeholder:text-muted/30 focus:shadow-sticker-lg transition-shadow uppercase"
          />

          {error && (
            <p className="text-sm text-pink font-bold max-w-[280px]">{error}</p>
          )}

          <button
            onClick={joinCouple}
            disabled={inviteCode.length !== 6 || loading}
            className="w-full max-w-[300px] py-4 bg-grape text-white sticker font-display font-bold text-base transition-transform active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                Join couple <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
