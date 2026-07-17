"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Copy, Check, Loader2 } from "lucide-react";

export default function WaitingPartnerPage() {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      // Fetch the pending couple
      const { data: couple } = await supabase
        .from("couples")
        .select("id, invite_code, status")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .in("status", ["pending", "linked"])
        .maybeSingle();

      if (!couple) {
        router.replace("/onboarding");
        return;
      }

      if (couple.status === "linked") {
        router.replace("/today");
        return;
      }

      setCode(couple.invite_code);
      setLoading(false);

      // Subscribe to changes on this couple row.
      // When user_b is set and status becomes 'linked', redirect.
      channel = supabase
        .channel(`couple-${couple.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "couples",
            filter: `id=eq.${couple.id}`,
          },
          (payload) => {
            if (payload.new.status === "linked") {
              toast.success("Your partner joined! 💞 Let's go!");
              router.replace("/today");
            }
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center gap-6">
      {/* Pulsing waiting indicator */}
      <div className="relative">
        <div
          className="sticker bg-cream flex items-center justify-center text-5xl"
          style={{ width: 100, height: 100, borderRadius: 32, transform: "rotate(-3deg)" }}
        >
          💌
        </div>
        <span
          className="absolute -bottom-1 -right-2 w-5 h-5 bg-pink rounded-full border-2 border-ink animate-pulse-dot"
        />
      </div>

      <div>
        <h2 className="text-2xl font-bold font-display text-ink">
          Waiting for your partner
        </h2>
        <p className="mt-2 text-sm text-muted max-w-[260px] mx-auto leading-snug">
          Share this code with them. The moment they join, you&apos;ll be
          whisked to today&apos;s prompt.
        </p>
      </div>

      {/* Code display */}
      <button
        onClick={copyCode}
        className="group sticker bg-white px-8 py-5 transition-transform active:scale-95 hover:-translate-y-0.5"
        style={{ borderRadius: 24 }}
      >
        <div
          className="text-4xl font-bold font-display tracking-[0.3em] text-ink"
        >
          {code}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-muted group-hover:text-grape transition-colors">
          {copied ? (
            <>
              <Check size={14} strokeWidth={3} className="text-mint" /> Copied!
            </>
          ) : (
            <>
              <Copy size={14} strokeWidth={2.5} /> Tap to copy
            </>
          )}
        </div>
      </button>

      {/* Share tip */}
      <div
        className="sticker-sm bg-mustard-light px-4 py-3 max-w-[300px] text-xs font-bold text-ink leading-snug"
        style={{ borderRadius: 14, transform: "rotate(1deg)" }}
      >
        💡 Pro tip: text them the code with something like{" "}
        <em>&quot;daily meme battle. you and me. this code: {code}&quot;</em>
      </div>

      {/* Listening indicator */}
      <p className="text-xs text-muted flex items-center gap-2">
        <span className="w-2 h-2 bg-mint rounded-full animate-pulse-dot" />
        Listening for your partner…
      </p>
    </div>
  );
}
