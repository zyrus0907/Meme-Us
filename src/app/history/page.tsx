"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useStyles } from "@/lib/styles";

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<any[]>([]);
  const s = useStyles();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data: c } = await supabase.from("couples").select("id").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).eq("status", "linked").maybeSingle();
      if (!c) { router.replace("/onboarding"); return; }
      const { data: rds } = await supabase.from("rounds").select("*").eq("couple_id", c.id).eq("submitted_count", 2).order("prompt_date", { ascending: false }).limit(14);
      if (rds && rds.length > 0) {
        const pids = rds.map((r: any) => r.prompt_id);
        const { data: prompts } = await supabase.from("daily_prompts").select("id, title, category").in("id", pids);
        const pm = new Map((prompts || []).map((p: any) => [p.id, { title: p.title, category: p.category }]));
        setRounds(rds.map((r: any) => ({ ...r, prompt_title: pm.get(r.prompt_id)?.title || "Untitled", prompt_category: pm.get(r.prompt_id)?.category || "meme" })));
      }
      setLoading(false);
    })();
  }, []);

  const catEmoji = (c: string) => c === "color" ? "🎨" : c === "sentimental" ? "💞" : "😂";
  const fmtDate = (d: string) => {
    const today = new Date().toISOString().split("T")[0];
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d === today) return "Today";
    if (d === y.toISOString().split("T")[0]) return "Yesterday";
    return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-bounce-load" style={{ fontSize: 48 }}>📒</span></div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 12px" }}>
        <button onClick={() => router.back()} style={s.backBtn as any}><span style={{ fontSize: 16 }}>←</span></button>
        <span style={{ fontSize: 22 }}>📒</span>
        <h1 className="font-display" style={s.title}>History</h1>
        <span style={{ ...s.pill, marginLeft: "auto", background: s.colors.cream, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: s.muted } as any}>Last 14</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 32px" }} className="no-bar">
        {rounds.length === 0 ? (
          <div className="animate-pop-in" style={{ ...s.card, padding: 40, textAlign: "center", marginTop: 20 } as any}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: s.ink }}>No unlocked rounds yet</p>
            <p style={{ fontSize: 13, color: s.muted, marginTop: 6 }}>Complete your first meme exchange!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rounds.map((r: any, i: number) => (
              <button key={r.prompt_id} onClick={() => router.push(`/reveal/${r.prompt_date}`)} className="animate-pop-in"
                style={{ ...s.card, width: "100%", padding: 16, display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", transition: "transform 0.15s", animationDelay: `${i * 40}ms` } as any}
                onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
                <div style={{ ...s.cardSm, width: 50, height: 50, borderRadius: 16, background: s.colors.cream, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 } as any}>
                  {catEmoji(r.prompt_category)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-display" style={{ fontSize: 15, fontWeight: 700, color: s.ink, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>&ldquo;{r.prompt_title}&rdquo;</p>
                  <p style={{ fontSize: 12, color: s.muted, margin: "3px 0 0" }}>{fmtDate(r.prompt_date)}</p>
                </div>
                <span style={{ fontSize: 16, color: s.muted }}>→</span>
              </button>
            ))}
          </div>
        )}
        {rounds.length > 0 && rounds.length < 14 && (
          <p style={{ textAlign: "center", fontSize: 12, color: s.muted, marginTop: 16 }}>
            {rounds.length} round{rounds.length !== 1 ? "s" : ""} completed 🔥
          </p>
        )}
        <div style={{ ...s.cardSm, background: s.colors.cream, padding: 14, textAlign: "center", marginTop: 16, borderStyle: "dashed" } as any}>
          <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>🔒 Full archive beyond 14 days coming soon</p>
        </div>
      </div>
    </div>
  );
}
