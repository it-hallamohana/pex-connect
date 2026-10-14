"use client";
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";
export default function Account({ profile }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError("");
    setSuccess("");
    if (f.get("new") !== f.get("confirm")) {
      setError("Konfirmasi kata sandi tidak sama.");
      return;
    }
    setBusy(true);
    try {
      const sb = createClient();
      const { error: verifyError } = await sb.auth.signInWithPassword({
        email: profile.email,
        password: f.get("current"),
      });
      if (verifyError) throw new Error("Kata sandi saat ini tidak sesuai.");
      const { error } = await sb.auth.updateUser({ password: f.get("new") });
      if (error) throw error;
      form.reset();
      setSuccess("Kata sandi berhasil diperbarui.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-card">
      <span className="account-icon">
        <ShieldCheck size={23} />
      </span>
      <h2>Akun Anda</h2>
      <p>
        {profile.full_name} · {profile.email}
      </p>
      <p>Jabatan: {profile.job_title || "Belum ditetapkan admin"}</p>
      <form onSubmit={submit}>
        <h3>
          <KeyRound size={17} />
          Ubah kata sandi
        </h3>
        <label>
          Kata sandi saat ini
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Kata sandi baru
          <input
            name="new"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Konfirmasi kata sandi baru
          <input
            name="confirm"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="account-hint">
          Gunakan minimal 12 karakter yang unik untuk akun Anda.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="resolution" role="status">
            {success}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Menyimpan..." : "Perbarui kata sandi"}
        </button>
      </form>
    </section>
  );
}
