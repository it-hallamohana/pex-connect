import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
export async function GET(request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/access", url.origin));
  }
  return NextResponse.redirect(
    new URL("/login?reason=confirmation", url.origin),
  );
}
