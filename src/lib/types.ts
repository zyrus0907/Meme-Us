export interface Profile {
  id: string;
  display_name: string | null;
  age_confirmed_at: string | null;
  created_at: string;
}

export interface Couple {
  id: string;
  invite_code: string;
  user_a: string;
  user_b: string | null;
  status: "pending" | "linked";
  streak_count: number;
  last_completed_date: string | null;
  created_at: string;
}

export interface DailyPrompt {
  id: string;
  prompt_date: string;
  title: string;
  description: string;
  category: "meme" | "color" | "sentimental";
}

export interface Submission {
  id: string;
  couple_id: string;
  prompt_id: string;
  user_id: string;
  image_url: string;
  top_text: string | null;
  bottom_text: string | null;
  created_at: string;
}

export interface Reaction {
  id: string;
  submission_id: string;
  from_user_id: string;
  emoji: "💀" | "🔥" | "🤡" | "😂";
  created_at: string;
}

export interface Round {
  couple_id: string;
  prompt_id: string;
  prompt_date: string;
  submitted_count: number;
  unlocked_at: string | null;
}
