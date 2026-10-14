import { membership } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export async function GET(request) {
  try {
    const { supabase, profile } = await membership();
    if (!profile) return new Response("Akses ditolak", { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!/^[0-9a-f-]{36}$/i.test(id || ""))
      return new Response("ID tidak valid", { status: 400 });
    const { data: leader, error } = await supabase
      .from("leaders")
      .select("photo_path")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (
      error ||
      !leader ||
      !/^leaders\/source-v1-[1-7]\.jpg$/.test(leader.photo_path)
    )
      return new Response("Foto tidak ditemukan", { status: 404 });
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        db: { schema: "mall" },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error: photoError } = await sb.storage
      .from("mall-attachments")
      .download(leader.photo_path);
    if (photoError) throw photoError;
    return new Response(data, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Foto tidak tersedia", { status: 500 });
  }
}
