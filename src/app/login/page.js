import Login from "@/components/login";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense
      fallback={<main className="loading">Memuat P-Ex Connect...</main>}
    >
      <Login />
    </Suspense>
  );
}
