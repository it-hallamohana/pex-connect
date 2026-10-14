import { membership } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { validateImage } from "@/lib/domain.mjs";
export const runtime = "nodejs";
const bucket = "mall-attachments";
function storage() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      db: { schema: "mall" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ).storage.from(bucket);
}
export async function POST(request) {
  try {
    if (
      request.headers.get("origin") !== new URL(request.url).origin &&
      request.headers.get("sec-fetch-site") !== "same-origin"
    )
      return Response.json({ error: "Origin ditolak." }, { status: 403 });
    const { profile } = await membership();
    if (!profile)
      return Response.json({ error: "Akses ditolak." }, { status: 403 });
    if (Number(request.headers.get("content-length")) > 5 * 1024 * 1024 + 10000)
      return Response.json({ error: "Ukuran maksimal 5 MB." }, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "Foto wajib dipilih." }, { status: 400 });
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 5 * 1024 * 1024 + 10000) {
        await reader.cancel();
        return Response.json(
          { error: "Ukuran maksimal 5 MB." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const form = await new Response(new Blob(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json({ error: "Foto wajib dipilih." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validateImage(bytes, file.type, file.size))
      return Response.json(
        { error: "Gunakan foto JPG, PNG, atau WebP asli, maksimal 5 MB." },
        { status: 400 },
      );
    const ext = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[file.type];
    const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await storage().upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    return Response.json(
      { path },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Foto gagal diunggah. Silakan coba lagi." },
      { status: 500 },
    );
  }
}
export async function GET(request) {
  try {
    const { supabase, profile } = await membership();
    if (!profile)
      return Response.json({ error: "Akses ditolak." }, { status: 403 });
    const url = new URL(request.url),
      id = url.searchParams.get("request"),
      kind = url.searchParams.get("kind");
    if (!["photo_url", "resolution_photo_url"].includes(kind))
      return Response.json(
        { error: "Jenis lampiran tidak valid." },
        { status: 400 },
      );
    const { data, error } = await supabase
      .from("requests")
      .select("photo_url,resolution_photo_url")
      .eq("id", id)
      .maybeSingle();
    if (error || !data?.[kind])
      return Response.json({ error: "Foto tidak ditemukan." }, { status: 404 });
    const { data: signed, error: signError } = await storage().createSignedUrl(
      data[kind],
      60,
    );
    if (signError) throw signError;
    return new Response(null, {
      status: 307,
      headers: {
        Location: signed.signedUrl,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "Foto tidak tersedia." }, { status: 500 });
  }
}
