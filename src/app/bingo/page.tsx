"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Clock3, Plus, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  isNativeApp,
  isNativeCancellation,
  nativeSuccessHaptic,
  pickNativePhoto,
} from "@/lib/native";
import { toast } from "sonner";
import styles from "./bingo.module.css";

interface CellPrompt {
  id: string;
  text: string;
  emoji: string;
}

interface BingoPhoto {
  id: string;
  board_id: string;
  cell_index: number;
  user_id: string;
  image_url: string;
  created_at: string;
}

interface BingoVote {
  id: string;
  photo_id: string;
  voter_id: string;
  approved: boolean;
}

type BoardTab = "mine" | "partner";
type CellStatus = "empty" | "pending" | "approved" | "rejected";

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export default function BingoPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState("Partner");
  const [myName, setMyName] = useState("You");
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [cells, setCells] = useState<CellPrompt[]>([]);
  const [photos, setPhotos] = useState<BingoPhoto[]>([]);
  const [votes, setVotes] = useState<BingoVote[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [viewingCell, setViewingCell] = useState<number | null>(null);
  const [tab, setTab] = useState<BoardTab>("mine");

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const loadBoard = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      const { data: couple } = await supabase
        .from("couples")
        .select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .eq("status", "linked")
        .maybeSingle();
      if (!couple) {
        router.replace("/onboarding");
        return;
      }
      setCoupleId(couple.id);

      const nextPartnerId =
        couple.user_a === user.id ? couple.user_b : couple.user_a;
      setPartnerId(nextPartnerId);

      const [{ data: myProfile }, { data: partnerProfile }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).single(),
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", nextPartnerId)
          .single(),
      ]);
      setMyName(myProfile?.display_name || "You");
      setPartnerName(partnerProfile?.display_name || "Partner");

      let nextBoardId: string | null = null;
      const response = await fetch("/api/generate-bingo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couple_id: couple.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) nextBoardId = result.board_id || null;

      if (!nextBoardId) {
        const { data } = await supabase.rpc("ensure_bingo_board", {
          cid: couple.id,
        });
        nextBoardId = data;
      }
      if (!nextBoardId) throw new Error("Could not load this week's board.");
      setBoardId(nextBoardId);

      const { data: board } = await supabase
        .from("bingo_boards")
        .select("cells, week_start")
        .eq("id", nextBoardId)
        .single();
      setCells((board?.cells as CellPrompt[]) || []);
      setWeekStart(board?.week_start || null);

      const { data: nextPhotos } = await supabase
        .from("bingo_photos")
        .select("*")
        .eq("board_id", nextBoardId);
      const loadedPhotos = (nextPhotos || []) as BingoPhoto[];
      setPhotos(loadedPhotos);

      if (loadedPhotos.length) {
        const { data: nextVotes } = await supabase
          .from("bingo_votes")
          .select("*")
          .in("photo_id", loadedPhotos.map((photo) => photo.id));
        setVotes((nextVotes || []) as BingoVote[]);
      } else {
        setVotes([]);
      }
    } catch (error) {
      console.error("Bingo load failed:", error);
      toast.error("Couldn’t load bingo. Try again.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!boardId) return;
    const channel = supabase
      .channel(`bingo-${boardId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bingo_photos",
          filter: `board_id=eq.${boardId}`,
        },
        () => void loadBoard(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bingo_votes" },
        () => void loadBoard(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [boardId, loadBoard, supabase]);

  const getPhoto = useCallback(
    (cellIndex: number, ownerId: string) =>
      photos.find(
        (photo) =>
          photo.cell_index === cellIndex && photo.user_id === ownerId,
      ),
    [photos],
  );

  const getCellStatus = useCallback(
    (cellIndex: number, ownerId: string): CellStatus => {
      const photo = getPhoto(cellIndex, ownerId);
      if (!photo) return "empty";
      const vote = votes.find((item) => item.photo_id === photo.id);
      if (vote?.approved === true) return "approved";
      if (vote?.approved === false) return "rejected";
      return "pending";
    },
    [getPhoto, votes],
  );

  const countApproved = (ownerId: string) =>
    Array.from({ length: 9 }, (_, index) =>
      getCellStatus(index, ownerId),
    ).filter((status) => status === "approved").length;

  const countFilled = (ownerId: string) =>
    photos.filter((photo) => photo.user_id === ownerId).length;

  const findBingo = (ownerId: string) =>
    LINES.find((line) =>
      line.every((index) => getCellStatus(index, ownerId) === "approved"),
    ) || null;

  const preparePhoto = async (source: Blob | string) => {
    const image = typeof source === "string"
      ? await new Promise<HTMLImageElement>((resolve, reject) => {
          const nextImage = new Image();
          nextImage.onload = () => resolve(nextImage);
          nextImage.onerror = reject;
          nextImage.src = source;
        })
      : await createImageBitmap(source);

    const canvas = document.createElement("canvas");
    const scale = Math.min(720 / image.width, 720 / image.height, 1);
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);

    const square = document.createElement("canvas");
    const cropSize = Math.min(canvas.width, canvas.height);
    square.width = cropSize;
    square.height = cropSize;
    square
      .getContext("2d")!
      .drawImage(
        canvas,
        (canvas.width - cropSize) / 2,
        (canvas.height - cropSize) / 2,
        cropSize,
        cropSize,
        0,
        0,
        cropSize,
        cropSize,
      );

    return new Promise<Blob>((resolve, reject) => {
      square.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Photo failed"))),
        "image/jpeg",
        0.78,
      );
    });
  };

  const uploadBlob = async (cellIndex: number, source: Blob | string) => {
    if (!boardId || !userId || !coupleId) return;
    setUploading(true);
    try {
      const blob = await preparePhoto(source);
      const filePath = `${coupleId}/bingo/${boardId}/${cellIndex}_${userId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("memes")
        .upload(filePath, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("bingo_photos")
        .insert({
          board_id: boardId,
          cell_index: cellIndex,
          user_id: userId,
          image_url: filePath,
        });
      if (insertError) throw insertError;

      await nativeSuccessHaptic().catch(() => undefined);
      toast.success("Cell logged ✦");

      if (partnerId) {
        fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partner_id: partnerId,
            title: "New bingo log ✦",
            message: `${myName} filled a cell — your verdict is needed.`,
            url: "/bingo",
          }),
        }).catch(() => undefined);
      }
      await loadBoard();
    } catch (error) {
      console.error("Bingo upload failed:", error);
      toast.error("Upload failed. Try another photo.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (cellIndex: number) => {
    if (!boardId || !userId || !coupleId) return;
    if (getPhoto(cellIndex, userId)) {
      toast("This cell is already filled");
      return;
    }

    if (isNativeApp()) {
      try {
        const dataUrl = await pickNativePhoto("camera");
        if (dataUrl) await uploadBlob(cellIndex, dataUrl);
      } catch (error) {
        if (!isNativeCancellation(error)) {
          toast.error("Camera unavailable. Check permission in Settings.");
        }
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) await uploadBlob(cellIndex, file);
    };
    input.click();
  };

  const handleVote = async (photoId: string, approved: boolean) => {
    if (reviewing) return;
    setReviewing(true);
    try {
      const response = await fetch("/api/bingo/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_id: photoId, approved }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Review failed");

      if (approved) {
        await nativeSuccessHaptic().catch(() => undefined);
        toast.success("Approved — it counts ✓");
      } else {
        toast("Rejected — the cell is open again");
      }
      setViewingCell(null);
      await loadBoard();
    } catch (error) {
      console.error("Bingo review failed:", error);
      toast.error("Couldn’t save your verdict. Try again.");
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <span>✦</span>
        <p>loading this week...</p>
      </div>
    );
  }

  if (!userId || !partnerId) return null;

  const myApproved = countApproved(userId);
  const partnerApproved = countApproved(partnerId);
  const myBingo = findBingo(userId);
  const partnerBingo = findBingo(partnerId);
  const viewOwnerId = tab === "mine" ? userId : partnerId;
  const viewingPhoto =
    viewingCell === null ? undefined : getPhoto(viewingCell, viewOwnerId);
  const weekLabel = weekStart
    ? new Date(`${weekStart}T12:00:00Z`).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      })
    : "this week";

  return (
    <main className={styles.page}>
      <div className={styles.doodleOne}>✦</div>
      <div className={styles.doodleTwo}>☺</div>

      <header className={styles.header}>
        <button
          className={styles.iconButton}
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <div className={styles.heading}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            WEEK OF {weekLabel.toUpperCase()}
          </div>
          <h1>BINGO<span>.log</span></h1>
        </div>
        <div className={styles.weekBadge}>3×3</div>
      </header>

      <section className={styles.scoreCard} aria-label="Weekly scores">
        <PlayerScore
          name={myName}
          label="YOU"
          approved={myApproved}
          filled={countFilled(userId)}
          colour="lilac"
        />
        <div className={styles.scoreDivider}>vs</div>
        <PlayerScore
          name={partnerName}
          label="THEM"
          approved={partnerApproved}
          filled={countFilled(partnerId)}
          colour="pink"
        />
      </section>

      <nav className={styles.tabs} aria-label="Choose bingo board">
        <button
          className={tab === "mine" ? styles.activeTab : ""}
          onClick={() => setTab("mine")}
          aria-pressed={tab === "mine"}
        >
          my camera roll
          <span>{countFilled(userId)}/9</span>
        </button>
        <button
          className={tab === "partner" ? styles.activeTab : ""}
          onClick={() => setTab("partner")}
          aria-pressed={tab === "partner"}
        >
          {partnerName.toLowerCase()}
          <span>{countFilled(partnerId)}/9</span>
        </button>
      </nav>

      <section className={styles.scrollArea}>
        {(myBingo || partnerBingo) && (
          <div className={styles.winnerBanner}>
            <span>★</span>
            <div>
              <strong>
                {myBingo ? "you made a line!" : `${partnerName} made a line`}
              </strong>
              <small>keep going for a full-board blackout</small>
            </div>
          </div>
        )}

        <div className={styles.board}>
          {cells.map((cell, index) => {
            const status = getCellStatus(index, viewOwnerId);
            const photo = getPhoto(index, viewOwnerId);
            const winningLine = tab === "mine" ? myBingo : partnerBingo;
            const isWinner = Boolean(winningLine?.includes(index));
            const myVote = photo
              ? votes.find(
                  (vote) =>
                    vote.photo_id === photo.id && vote.voter_id === userId,
                )
              : undefined;
            const needsReview =
              tab === "partner" && Boolean(photo) && !myVote;

            return (
              <button
                key={cell.id || index}
                className={`${styles.cell} ${styles[status]} ${
                  isWinner ? styles.winningCell : ""
                }`}
                onClick={() => {
                  if (tab === "mine" && status === "empty") {
                    void handleUpload(index);
                  } else if (photo) {
                    setViewingCell(index);
                  }
                }}
                aria-label={`${cell.text}. ${status}${
                  needsReview ? ". Needs your review" : ""
                }`}
              >
                <span className={styles.cellNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.cellEmoji}>{cell.emoji}</span>
                <span className={styles.cellText}>{cell.text}</span>

                {status === "empty" && tab === "mine" && (
                  <span className={styles.addMark}>
                    <Plus size={14} /> log it
                  </span>
                )}
                {status === "pending" && (
                  <span className={styles.statusMark}>
                    <Clock3 size={12} />
                    {needsReview ? "review" : "waiting"}
                  </span>
                )}
                {status === "approved" && (
                  <span className={styles.statusMark}>
                    <Check size={12} /> counted
                  </span>
                )}
                {needsReview && <span className={styles.reviewPing}>!</span>}
              </button>
            );
          })}
        </div>

        <div className={styles.legend}>
          <span><i className={styles.emptyKey} /> open</span>
          <span><i className={styles.pendingKey} /> waiting</span>
          <span><i className={styles.approvedKey} /> counted</span>
        </div>

        <aside className={styles.howTo}>
          <span className={styles.tape} />
          <p className={styles.monoLabel}>HOW IT WORKS.TXT</p>
          <strong>take it. send it. judge it.</strong>
          <p>
            Tap an open square to shoot. Your partner approves the proof.
            Rejected shots reopen instantly, and the first approved line wins.
          </p>
        </aside>
      </section>

      {viewingCell !== null && viewingPhoto && (
        <div
          className={styles.overlay}
          onClick={() => setViewingCell(null)}
          role="presentation"
        >
          <section
            className={styles.viewer}
            onClick={(event) => event.stopPropagation()}
            aria-label="Bingo photo"
          >
            <div className={styles.viewerHeader}>
              <div>
                <span>{cells[viewingCell]?.emoji}</span>
                <div>
                  <small>LOG {String(viewingCell + 1).padStart(2, "0")}</small>
                  <strong>{cells[viewingCell]?.text}</strong>
                </div>
              </div>
              <button
                onClick={() => setViewingCell(null)}
                aria-label="Close photo"
              >
                <X size={19} />
              </button>
            </div>

            <PhotoViewer photo={viewingPhoto} supabase={supabase} />

            <div className={styles.photoMeta}>
              <span>
                {viewingPhoto.user_id === userId ? myName : partnerName}
              </span>
              <time>
                {new Date(viewingPhoto.created_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>

            <ReviewPanel
              photo={viewingPhoto}
              userId={userId}
              partnerName={partnerName}
              vote={votes.find((vote) => vote.photo_id === viewingPhoto.id)}
              reviewing={reviewing}
              onVote={handleVote}
            />
          </section>
        </div>
      )}

      {uploading && (
        <div className={styles.uploadOverlay}>
          <div>
            <RotateCcw className={styles.spinner} size={26} />
            <strong>developing photo...</strong>
            <span>one sec, it’s giving 2006</span>
          </div>
        </div>
      )}
    </main>
  );
}

function PlayerScore({
  name,
  label,
  approved,
  filled,
  colour,
}: {
  name: string;
  label: string;
  approved: number;
  filled: number;
  colour: "lilac" | "pink";
}) {
  return (
    <div className={styles.playerScore}>
      <div className={`${styles.avatar} ${styles[colour]}`}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div className={styles.playerCopy}>
        <small>{label}</small>
        <strong>{name}</strong>
        <div className={styles.progressTrack}>
          <span style={{ width: `${(approved / 9) * 100}%` }} />
        </div>
        <em>{approved} approved · {filled} shot</em>
      </div>
    </div>
  );
}

function ReviewPanel({
  photo,
  userId,
  partnerName,
  vote,
  reviewing,
  onVote,
}: {
  photo: BingoPhoto;
  userId: string;
  partnerName: string;
  vote?: BingoVote;
  reviewing: boolean;
  onVote: (photoId: string, approved: boolean) => Promise<void>;
}) {
  if (vote) {
    return (
      <div className={`${styles.verdict} ${vote.approved ? styles.yes : styles.no}`}>
        {vote.approved ? "✓ approved and counted" : "× rejected — retake needed"}
      </div>
    );
  }

  if (photo.user_id === userId) {
    return (
      <div className={styles.waitingVerdict}>
        <Clock3 size={15} />
        waiting for {partnerName}&apos;s verdict
      </div>
    );
  }

  return (
    <div className={styles.reviewPanel}>
      <p>does the photo match?</p>
      <div>
        <button
          className={styles.rejectButton}
          onClick={() => void onVote(photo.id, false)}
          disabled={reviewing}
        >
          <X size={17} /> redo
        </button>
        <button
          className={styles.approveButton}
          onClick={() => void onVote(photo.id, true)}
          disabled={reviewing}
        >
          <Check size={17} /> count it
        </button>
      </div>
    </div>
  );
}

function PhotoViewer({
  photo,
  supabase,
}: {
  photo: BingoPhoto;
  supabase: ReturnType<typeof createClient>;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.storage
      .from("memes")
      .createSignedUrl(photo.image_url, 3600)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl || null);
      });
    return () => {
      active = false;
    };
  }, [photo.image_url, supabase]);

  if (!url) {
    return <div className={styles.photoLoading}>developing...</div>;
  }

  return <img className={styles.photo} src={url} alt="Bingo submission" />;
}
