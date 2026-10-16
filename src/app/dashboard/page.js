import { canDashboard } from "@/lib/registration.mjs";
import { membership } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Portal from "@/components/portal";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const { profile, authenticated } = await membership();
  if (!authenticated) redirect("/login");
  if (!profile) redirect("/access");
  if (!canDashboard(profile.role)) redirect("/request");
  return <Portal profile={profile} initialSection="overview" />;
}
