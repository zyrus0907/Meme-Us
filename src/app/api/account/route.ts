import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// DELETE /api/account
// 1. Identifies the user's couple and all their Storage files.
// 2. Purges files from the `memes` bucket (service role — clients can't delete).
// 3. Calls delete_my_account() RPC which cascades all DB rows + auth user.
//
// ⚠️ [HR-3] HUMAN REVIEW REQUIRED before launch — verify this covers all data.
export async function DELETE() {
  // 1. Get the authenticated user
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(c: any) {
          try { c.forEach(({ name, value, options }: any) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2. Find the user's couple (if any)
  const { data: couple } = await supabase
    .from("couples")
    .select("id")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .maybeSingle();

  // 3. Use service role to purge Storage files
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (couple) {
    // List all files under the couple's folder
    const { data: files } = await admin.storage
      .from("memes")
      .list(couple.id, { limit: 1000 });

    if (files && files.length > 0) {
      // Files might be nested in prompt subfolders
      // List each subfolder's contents
      const allPaths: string[] = [];

      for (const item of files) {
        if (item.id === null || item.metadata === null) {
          // It's a folder — list its contents
          const { data: subFiles } = await admin.storage
            .from("memes")
            .list(`${couple.id}/${item.name}`, { limit: 100 });

          if (subFiles) {
            for (const sf of subFiles) {
              allPaths.push(`${couple.id}/${item.name}/${sf.name}`);
            }
          }
        } else {
          allPaths.push(`${couple.id}/${item.name}`);
        }
      }

      if (allPaths.length > 0) {
        await admin.storage.from("memes").remove(allPaths);
      }
    }
  }

  // 4. Call the RPC to cascade-delete all DB rows + auth user
  const { error } = await admin.rpc("delete_my_account");

  // The RPC runs as SECURITY DEFINER but we're calling via service role.
  // We need to call it with the user's context. Let's do it via the user's client instead.
  const { error: rpcError } = await supabase.rpc("delete_my_account");

  if (rpcError) {
    console.error("delete_my_account RPC failed:", rpcError);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
