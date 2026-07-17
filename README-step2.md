# Meme Us MVP — Step 2 deliverable (Auth + Onboarding)

## What's built

All three auth/onboarding pages from the spec's page list:

- **/login** — Google + Apple sign-in buttons via Supabase OAuth. The age-of-majority notice is shown here ("by continuing you confirm you're 18+"), and the age gate is enforced as a separate step in onboarding.
- **/onboarding** — four sub-steps in one page:
  1. **Age gate** — explicit "I'm 18 or older" confirmation; writes `age_confirmed_at` to the profile. Blocks all further access until confirmed. [HR-4]
  2. **Display name** — saved to `profiles.display_name`.
  3. **Create or Join** — choose your path.
  4. **Create** → calls `create_couple()` RPC, shows the 6-char code with a copy button → sends to /waiting-partner.
     **Join** → 6-char input, calls `join_couple()` RPC with full error handling (invalid code, couple full, already in couple, can't join own) → on success, redirects to /today.
- **/waiting-partner** — shows the code, copy button, "pro tip" share text. Subscribes to Supabase Realtime on the couple row; the moment the partner joins (status flips to `linked`), auto-redirects to /today with a toast.
- **/today** — placeholder that proves auth + coupling worked. Shows the current user's name, partner's name, streak count, today's prompt (calls `ensure_today_prompt()` lazily), and a "Make your meme" button that alerts "Step 4 builds this."
- **/terms** and **/privacy** — placeholder legal pages, flagged for human review.
- **/auth/callback** — route handler that exchanges the OAuth code, checks age gate + couple status, and routes the user to the correct page.

Supporting infrastructure:
- **Middleware** (`src/middleware.ts`) — refreshes the Supabase session on every request, redirects unauthenticated users to /login, redirects authenticated users away from /login.
- **Supabase clients** — browser (`src/lib/supabase/client.ts`) and server (`src/lib/supabase/server.ts`) using `@supabase/ssr`.
- **Tailwind theme** — custom colors, fonts, and the "sticker" design system from the prototype, so every future step inherits a consistent look.

## Routing logic (who ends up where)

```
Not logged in                    → /login
Logged in, no age_confirmed_at   → /onboarding (age gate)
Logged in, no display_name       → /onboarding (name step)
Logged in, no couple             → /onboarding (create/join)
Logged in, couple status=pending → /waiting-partner
Logged in, couple status=linked  → /today
```

This logic lives in three places (belt and braces): the middleware, the /auth/callback route handler, and the root / page. A user always lands in the right place regardless of entry point.

## How to run locally

1. Clone / copy this project folder.

2. Copy `.env.local.example` to `.env.local` and fill in your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://nmlmndessrendmbzqsul.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key from Settings → API>
   ```
   (You don't need `SUPABASE_SERVICE_ROLE_KEY` until Step 6.)

3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000` — you should see the login page.

5. **Google OAuth won't work on localhost unless** you add `http://localhost:3000` to your Google Cloud Console OAuth client's **Authorized JavaScript origins**, and add `https://nmlmndessrendmbzqsul.supabase.co/auth/v1/callback` as a **Redirect URI** (you already did this). Supabase handles the redirect back.

6. Apple sign-in requires an Apple Developer account with a Services ID configured. You can skip it for dev and test with Google only.

## What to test (UAT subset for Step 2)

- [ ] Clicking "Continue with Google" redirects to Google, then back to /onboarding (age gate).
- [ ] Confirming age → name step → choose "Create a couple" → see a 6-char code.
- [ ] Copying the code works (clipboard).
- [ ] Clicking "I've sent it" → /waiting-partner shows the code and the "Listening…" indicator.
- [ ] In a second browser / incognito: sign in with a different Google account → onboarding → "Join with a code" → enter the code → "You're linked! 💞" → redirected to /today.
- [ ] The first browser (waiting-partner) auto-redirects to /today when the partner joins.
- [ ] /today shows both names, the streak (0), and today's prompt.
- [ ] Trying to join with a fake code → "That code doesn't exist."
- [ ] Trying to join a code that's already been used → "That couple already has two people."
- [ ] Refreshing any page lands you back in the right place (middleware routing).

## ⚠️ Human review items carried forward

- [HR-1] RLS policies (Step 1) — especially blind-reveal on submissions.
- [HR-2] Storage signed-URL policies (Step 1).
- [HR-3] Data deletion (Step 6 will build the Edge Function for Storage purge).
- [HR-4] **Age gate** — the flow is built (explicit confirmation, timestamp stored). Verify that `age_confirmed_at` being null truly blocks all access. The Terms placeholder must be replaced with real legal copy before launch.
- Auth provider config (Google client ID/secret, Apple Services ID) — verify redirect URIs match.

## What's next

**Step 3: Daily prompt system** — the `prompt_pool` and `ensure_today_prompt()` are already in the DB from Step 1, and /today already calls the RPC lazily. Step 3 adds the Vercel cron route as a belt-and-braces backup, and makes the prompt display richer (countdown timer, category badge styling). It's a light step.

Then **Step 4: /create** — the real work: camera capture, top/bottom text overlay, canvas flattening, upload to Supabase Storage. That's the core meme-making loop.

— Ready when you are.
