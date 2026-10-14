import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Registration from "@/components/registration";
export const dynamic = "force-dynamic";
export default async function Access() {
  const sb = await createClient();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) redirect("/login");
  const { data, error: stateError } = await sb.rpc("access_state");
  if (stateError)
    throw new Error(
      "Status akses belum dapat dimuat. Coba lagi atau hubungi administrator.",
    );
  if (data.status === "active") redirect("/dashboard");
  return (
    <Registration
      accessState={data}
      defaults={user.user_metadata?.mall_registration || {}}
    />
  );
}
