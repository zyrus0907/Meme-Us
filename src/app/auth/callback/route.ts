import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/today";

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if the user has confirmed their age yet
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("age_confirmed_at")
          .eq("id", user.id)
          .single();

        // New user or hasn't confirmed age → onboarding
        if (!profile?.age_confirmed_at) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        // Has age confirmation — check if they have a linked couple
        const { data: couple } = await supabase
          .from("couples")
          .select("id, status")
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
          .in("status", ["pending", "linked"])
          .maybeSingle();

        if (!couple) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
        if (couple.status === "pending") {
          return NextResponse.redirect(`${origin}/waiting-partner`);
        }
        // Linked → go to today
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Something went wrong — back to login
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
