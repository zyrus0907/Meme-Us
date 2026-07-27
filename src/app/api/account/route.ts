import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function listStorageFiles(admin: any, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 8) throw new Error("Storage folder nesting is too deep");
  const { data: items, error } = await admin.storage.from("memes").list(prefix, { limit: 1000 });
  if (error) throw error;

  const paths: string[] = [];
  for (const item of items || []) {
    const path = `${prefix}/${item.name}`;
    if (item.id == null) paths.push(...await listStorageFiles(admin, path, depth + 1));
    else paths.push(path);
  }
  return paths;
}

async function removeStorageFiles(admin: any, paths: string[]) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await admin.storage.from("memes").remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

// DELETE /api/account
// 1. Identifies the user's couple and all their Storage files.
// 2. Purges files from the `memes` bucket (service role — clients can't delete).
// 3. Calls delete_my_account() RPC which cascades all DB rows + auth user.
//
// ⚠️ [HR-3] HUMAN REVIEW REQUIRED before launch — verify this covers all data.
export async function DELETE() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Account deletion is not configured" }, { status: 503 });
  }
  // 1. Get the authenticated user
  const cookieStore = await cookies();
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

  try {
    const couplePaths = couple ? await listStorageFiles(admin, couple.id) : [];
    const { data: roomSubmissions, error: roomError } = await admin
      .from("room_submissions")
      .select("image_url")
      .eq("user_id", user.id);
    if (roomError) throw roomError;

    const roomPaths = (roomSubmissions || []).map((row: any) => row.image_url).filter(Boolean);
    await removeStorageFiles(admin, [...new Set([...couplePaths, ...roomPaths])]);
  } catch (storageError) {
    console.error("Account storage purge failed:", storageError);
    return NextResponse.json({ error: "Failed to remove account files" }, { status: 500 });
  }

  // 4. Run the SECURITY DEFINER RPC with the user's authenticated context.
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
