"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Room { id: string; name: string; invite_code: string; created_by: string; member_count?: number; }

export default function RoomsPage() {
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");

  const router = useRouter();
  const supabase = createClient();

  const loadRooms = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setUserId(user.id);

    const { data: memberships } = await supabase.from("room_members").select("room_id").eq("user_id", user.id);
    if (memberships && memberships.length > 0) {
      const roomIds = memberships.map(m => m.room_id);
      const { data: roomData } = await supabase.from("rooms").select("*").in("id", roomIds);

      // Get member counts
      const roomsWithCounts = await Promise.all((roomData || []).map(async (r) => {
        const { count } = await supabase.from("room_members").select("*", { count: "exact", head: true }).eq("room_id", r.id);
        return { ...r, member_count: count || 0 };
      }));
      setRooms(roomsWithCounts);
    }
    setLoading(false);
  };

  useEffect(() => { loadRooms(); }, []);

  const createRoom = async () => {
    if (!newName.trim()) return;
    setCreating(true); setError("");
    const { data, error } = await supabase.rpc("create_room", { room_name: newName.trim() });
    setCreating(false);
    if (error) { setError("Couldn't create room."); return; }
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(`Room created! Code: ${row.invite_code}`);
    setShowCreate(false); setNewName("");
    await loadRooms();
    router.push(`/rooms/${row.room_id}`);
  };

  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError("Codes are 6 characters."); return; }
    setJoining(true); setError("");
    const { data, error } = await supabase.rpc("join_room", { code });
    setJoining(false);
    if (error) {
      if (error.message?.includes("invalid_code")) setError("That code doesn't exist.");
      else if (error.message?.includes("room_full")) setError("Room is full.");
      else setError("Couldn't join.");
      return;
    }
    toast.success("Joined! 🎉");
    setShowJoin(false); setJoinCode("");
    await loadRooms();
    router.push(`/rooms/${data}`);
  };

  const S = {
    card: { background: "#fff", border: "2px solid #241B4D", borderRadius: 20, boxShadow: "4px 4px 0 #241B4D" } as any,
    btn: (bg: string, color = "#fff") => ({ padding: "16px 24px", fontSize: 15, fontWeight: 700, color, background: bg, border: "2px solid #241B4D", borderRadius: 18, boxShadow: "4px 4px 0 #241B4D", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "transform 0.15s" }) as any,
    input: { width: "100%", padding: "14px 18px", fontSize: 15, fontWeight: 700, color: "#241B4D", background: "#fff", border: "2px solid #241B4D", borderRadius: 16, boxShadow: "2px 2px 0 #241B4D", outline: "none" } as any,
    overlay: { position: "fixed" as const, inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(36,27,77,0.5)" },
    modal: { width: "100%", maxWidth: 380, background: "#FFF8EC", border: "2px solid #241B4D", borderRadius: 28, padding: 24, boxShadow: "6px 6px 0 #241B4D" } as any,
  };

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="animate-bounce-load" style={{ fontSize: 48 }}>🏠</span></div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 8px", flexShrink: 0 }}>
        <button onClick={() => router.back()} className="sticker-sm" style={{ padding: 10, background: "#fff", borderRadius: 14, display: "flex", cursor: "pointer" }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, color: "#241B4D", margin: 0 }}>Rooms 🏠</h1>
          <p style={{ fontSize: 12, color: "#8A84A3", margin: 0 }}>Play with friends & groups</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 32px" }} className="no-bar">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Create & Join buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setShowCreate(true); setError(""); }} className="font-display" style={{ ...S.btn("#6C5CE7"), flex: 1 }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              ✨ Create
            </button>
            <button onClick={() => { setShowJoin(true); setError(""); }} className="font-display" style={{ ...S.btn("#FF5C8A"), flex: 1 }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              🔗 Join
            </button>
          </div>

          {/* Room list */}
          {rooms.length === 0 ? (
            <div style={{ ...S.card, padding: 32, textAlign: "center" }} className="animate-pop-in">
              <span style={{ fontSize: 48 }}>🏠</span>
              <p className="font-display" style={{ fontSize: 18, fontWeight: 700, color: "#241B4D", margin: "12px 0 4px" }}>No rooms yet</p>
              <p style={{ fontSize: 13, color: "#8A84A3" }}>Create a room and invite your friends to play together!</p>
            </div>
          ) : (
            rooms.map((room, i) => (
              <button
                key={room.id}
                onClick={() => router.push(`/rooms/${room.id}`)}
                className="animate-pop-in"
                style={{ ...S.card, padding: 18, width: "100%", textAlign: "left", cursor: "pointer", transition: "transform 0.15s", animationDelay: `${i * 50}ms` }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p className="font-display" style={{ fontSize: 18, fontWeight: 700, color: "#241B4D", margin: 0 }}>
                      🏠 {room.name}
                    </p>
                    <p style={{ fontSize: 12, color: "#8A84A3", margin: "4px 0 0" }}>
                      {room.member_count} member{room.member_count !== 1 ? "s" : ""} · Code: {room.invite_code}
                    </p>
                  </div>
                  <span style={{ fontSize: 16, color: "#6C5CE7" }}>→</span>
                </div>
              </button>
            ))
          )}

          {/* Info */}
          <div className="sticker-sm" style={{ background: "#EFEAFF", padding: 14, textAlign: "center" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#241B4D", margin: 0, lineHeight: 1.7 }}>
              🏠 Rooms are for friends & groups (2-12 people)<br />
              👀 Photos are visible as soon as posted (no blind reveal)<br />
              💀🔥🤡😂 React to each other&apos;s memes<br />
              📸 Everyone gets the same daily prompt
            </p>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={S.overlay} onClick={() => setShowCreate(false)}>
          <div style={S.modal} onClick={(e: any) => e.stopPropagation()}>
            <h3 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#241B4D", marginBottom: 14 }}>✨ Create a room</h3>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Room name (e.g. The Squad)" maxLength={30} autoFocus style={{ ...S.input, marginBottom: 12 }} />
            {error && <p style={{ fontSize: 13, color: "#FF5C8A", fontWeight: 700, marginBottom: 8 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCreate(false)} className="font-display" style={{ ...S.btn("#fff", "#241B4D"), flex: 1 }}>Cancel</button>
              <button onClick={createRoom} disabled={!newName.trim() || creating} className="font-display" style={{ ...S.btn("#6C5CE7"), flex: 1, opacity: !newName.trim() ? 0.4 : 1 }}>
                {creating ? "..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join modal */}
      {showJoin && (
        <div style={S.overlay} onClick={() => setShowJoin(false)}>
          <div style={S.modal} onClick={(e: any) => e.stopPropagation()}>
            <h3 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#241B4D", marginBottom: 14 }}>🔗 Join a room</h3>
            <input value={joinCode} onChange={(e) => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)); setError(""); }}
              placeholder="ABC123" maxLength={6} autoFocus style={{ ...S.input, textAlign: "center", fontSize: 28, letterSpacing: "0.25em", marginBottom: 12 }} />
            {error && <p style={{ fontSize: 13, color: "#FF5C8A", fontWeight: 700, marginBottom: 8 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowJoin(false)} className="font-display" style={{ ...S.btn("#fff", "#241B4D"), flex: 1 }}>Cancel</button>
              <button onClick={joinRoom} disabled={joinCode.length !== 6 || joining} className="font-display" style={{ ...S.btn("#FF5C8A"), flex: 1, opacity: joinCode.length !== 6 ? 0.4 : 1 }}>
                {joining ? "..." : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
