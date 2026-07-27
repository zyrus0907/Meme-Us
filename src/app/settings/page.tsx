"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useStyles } from "@/lib/styles";
import { useTheme } from "@/lib/theme";
import { toast } from "sonner";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUnlink, setShowUnlink] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { theme, toggle } = useTheme();
  const s = useStyles();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setEmail(user.email || "");
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      setDisplayName(prof?.display_name || "");
      const { data: c } = await supabase.from("couples").select("*").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).in("status", ["pending", "linked"]).maybeSingle();
      if (c) {
        setCoupleId(c.id);
        const pid = c.user_a === user.id ? c.user_b : c.user_a;
        if (pid) { const { data: pp } = await supabase.from("profiles").select("display_name").eq("id", pid).single(); setPartnerName(pp?.display_name || null); }
      }
      setLoading(false);
    })();
  }, []);

  const saveName = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", user.id);
    setSaving(false);
    toast.success("Name updated!");
  };
  const signOut = async () => { await supabase.auth.signOut(); router.replace("/login"); };
  const unlinkCouple = async () => {
    setUnlinkLoading(true);
    await supabase.rpc("unlink_couple");
    setUnlinkLoading(false);
    toast.success("Couple unlinked.");
    setShowUnlink(false);
    router.replace("/onboarding");
  };
  const deleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Account deletion failed");
      }
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      toast.error("Your account was not deleted. Please try again.");
      setDeleteLoading(false);
    }
  };

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-bounce-load" style={{ fontSize: 40 }}>⚙️</span></div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 12px" }}>
        <button onClick={() => router.back()} style={s.backBtn as any}><span style={{ fontSize: 16 }}>←</span></button>
        <span style={{ fontSize: 22 }}>⚙️</span>
        <h1 className="font-display" style={s.title}>Settings</h1>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 32px" }} className="no-bar">
        {/* Name */}
        <div className="animate-pop-in" style={{ ...s.card, padding: 20, marginBottom: 14 } as any}>
          <p style={{ fontSize: 13, fontWeight: 700, color: s.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Display name</p>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} style={{ ...s.input, flex: 1 } as any} />
            <button onClick={saveName} disabled={!displayName.trim() || saving} className="font-display" style={{ ...s.btn(s.colors.grape), width: "auto", padding: "12px 20px", opacity: !displayName.trim() ? 0.4 : 1 } as any}>
              {saving ? "..." : "✓ Save"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: s.muted, marginTop: 8 }}>{email}</p>
        </div>

        {/* Appearance */}
        <div className="animate-pop-in" style={{ ...s.card, padding: 20, marginBottom: 14 } as any}>
          <p style={{ fontSize: 13, fontWeight: 700, color: s.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Appearance</p>
          <button onClick={toggle} className="font-display" style={{ ...s.btn(theme === "dark" ? s.colors.grape : s.colors.cream, theme === "dark" ? "#fff" : s.colors.ink) } as any}
            onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
            {theme === "light" ? "🌙 Switch to dark mode" : "☀️ Switch to light mode"}
          </button>
        </div>

        {/* Couple */}
        {coupleId && (
          <div className="animate-pop-in" style={{ ...s.card, padding: 20, marginBottom: 14 } as any}>
            <p style={{ fontSize: 13, fontWeight: 700, color: s.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Your couple</p>
            <p style={{ fontSize: 15, color: s.ink, marginBottom: 14 }}>Linked with <strong>{partnerName || "your partner"}</strong> 💞</p>
            <button onClick={() => setShowUnlink(true)} className="font-display" style={{ ...s.btn(s.colors.cream, s.ink) } as any}
              onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
              🔗 Unlink couple
            </button>
            <p style={{ fontSize: 11, color: s.muted, marginTop: 8, lineHeight: 1.5 }}>Permanently removes all shared memes, reactions, and streak.</p>
          </div>
        )}

        {/* Sign out */}
        <button onClick={signOut} className="animate-pop-in" style={{ ...s.card, padding: 16, width: "100%", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" } as any}
          onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
          <span style={{ fontSize: 20 }}>🚪</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: s.ink }}>Sign out</span>
        </button>

        {/* Danger */}
        <div className="animate-pop-in" style={{ ...s.card, padding: 20, marginBottom: 14, background: s.colors.pinkLight, borderColor: s.colors.pink } as any}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: s.ink }}>Danger zone</span>
          </div>
          <button onClick={() => setShowDelete(true)} className="font-display" style={{ ...s.btn(s.colors.pink) } as any}
            onMouseDown={s.press} onMouseUp={s.release} onMouseLeave={s.release}>
            🗑️ Delete account &amp; all data
          </button>
          <p style={{ fontSize: 11, color: s.muted, marginTop: 8, lineHeight: 1.5 }}>Permanently removes everything. Cannot be undone.</p>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "16px 0 8px" }}>
          <a href="/terms" style={{ fontSize: 12, color: s.muted, textDecoration: "underline" }}>Terms</a>
          <a href="/privacy" style={{ fontSize: 12, color: s.muted, textDecoration: "underline" }}>Privacy</a>
        </div>
        <p style={{ textAlign: "center", fontSize: 11, color: s.muted, opacity: 0.5 }}>Meme Us MVP · v0.1</p>
      </div>

      {/* Unlink modal */}
      {showUnlink && (
        <div style={s.overlay as any} onClick={() => setShowUnlink(false)}>
          <div style={s.modal as any} onClick={(e: any) => e.stopPropagation()}>
            <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: s.ink, marginBottom: 8 }}>Unlink couple? 💔</h3>
            <p style={{ fontSize: 14, color: s.muted, lineHeight: 1.6, marginBottom: 20 }}>All shared memes, reactions, and streak will be deleted.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowUnlink(false)} className="font-display" style={{ ...s.btn(s.colors.bgCard, s.ink), flex: 1 } as any}>Cancel</button>
              <button onClick={unlinkCouple} disabled={unlinkLoading} className="font-display" style={{ ...s.btn(s.colors.pink), flex: 1, opacity: unlinkLoading ? 0.6 : 1 } as any}>
                {unlinkLoading ? "..." : "Unlink"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div style={s.overlay as any} onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}>
          <div style={{ ...s.modal, borderColor: s.colors.pink } as any} onClick={(e: any) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: s.ink, margin: 0 }}>Delete everything?</h3>
            </div>
            <p style={{ fontSize: 14, color: s.muted, lineHeight: 1.6, marginBottom: 16 }}>This permanently removes everything. <strong style={{ color: s.ink }}>Cannot be undone.</strong></p>
            <p style={{ fontSize: 12, fontWeight: 700, color: s.ink, marginBottom: 6 }}>Type DELETE to confirm:</p>
            <input aria-label="Type DELETE to confirm account deletion" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())} placeholder="DELETE" autoCapitalize="characters" autoComplete="off" style={{ ...s.input, textAlign: "center", letterSpacing: 6, textTransform: "uppercase", borderColor: s.colors.pink, marginBottom: 16 } as any} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowDelete(false); setDeleteConfirm(""); }} className="font-display" style={{ ...s.btn(s.colors.bgCard, s.ink), flex: 1 } as any}>Cancel</button>
              <button onClick={deleteAccount} disabled={deleteConfirm !== "DELETE" || deleteLoading} className="font-display" style={{ ...s.btn(s.colors.pink), flex: 1, opacity: deleteConfirm !== "DELETE" ? 0.4 : 1 } as any}>
                {deleteLoading ? "..." : "🗑️ Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
