"use client";
import { createBrowserClient } from "@supabase/ssr";
let client;
export function createClient() {
  return (client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      db: { schema: "mall" },
      cookieOptions: { name: "pex-mall-auth" },
      auth: { persistSession: true, autoRefreshToken: true },
    },
  ));
}
