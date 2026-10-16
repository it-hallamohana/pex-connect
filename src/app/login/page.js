import { membership } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Login from "@/components/login";
import { Suspense } from "react";
export default async function Page() {
  const { profile, authenticated } = await membership();
  if (profile) redirect("/request");
  if (authenticated) redirect("/access");
  return (
    <Suspense
      fallback={<main className="loading">Memuat P-Ex Connect...</main>}
    >
      <Login />
    </Suspense>
  );
}
