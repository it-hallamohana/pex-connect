"use client";
import JobTitleField from "@/components/job-title-field";
import AuthBackdrop from "@/components/auth-backdrop";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  UserRoundPlus,
  ShieldCheck,
  CheckCheck,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { departmentOptions, registrationValues } from "@/lib/registration.mjs";

export function RegistrationFields({ defaults = {} }) {
  const [kind, setKind] = useState(defaults.p_account_type || "staff");
  return (
    <>
      <div className="form-grid">
        <label>
          Nama lengkap *
          <input
            name="full_name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            defaultValue={defaults.p_full_name || ""}
          />
        </label>
        <label>
          Nomor telepon *
          <input
            name="phone"
            type="tel"
            required
            minLength={6}
            maxLength={30}
            autoComplete="tel"
            defaultValue={defaults.p_phone || ""}
          />
        </label>
        <label>
          Jenis pengguna *
          <select
            name="account_type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="staff">Staf mall</option>
            <option value="tenant">Perwakilan tenant</option>
          </select>
        </label>
        <label>
          Departemen yang diajukan *
          <select
            name="department"
            required
            defaultValue={defaults.p_department_code || ""}
          >
            <option value="" disabled>
              Pilih departemen
            </option>
            {departmentOptions.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <JobTitleField defaultValue={defaults.p_job_title || ""} />
      {kind === "tenant" && (
        <div className="form-grid">
          <label>
            Nama tenant *
            <input
              name="tenant_name"
              required
              maxLength={120}
              defaultValue={defaults.p_tenant_name || ""}
            />
          </label>
          <label>
            Nomor unit *
            <input
              name="unit_number"
              required
              maxLength={100}
              defaultValue={defaults.p_unit_number || ""}
            />
          </label>
        </div>
      )}
    </>
  );
}
export default function Registration({ accessState = null, defaults = {} }) {
  const [authReady, setAuthReady] = useState(Boolean(accessState));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const status = accessState?.status;
  const application = accessState?.application;
  const canApply =
    !accessState || ["unregistered", "rejected"].includes(status);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      values = registrationValues(f);
    try {
      const sb = createClient();
      if (!authReady) {
        if (f.get("password") !== f.get("confirm"))
          throw new Error("Konfirmasi kata sandi tidak sama.");
        const { data, error } = await sb.auth.signUp({
          email: f.get("email").trim(),
          password: f.get("password"),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { mall_registration: values },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSuccess(
            "Periksa email untuk memverifikasi akun, lalu kembali login ke P-Ex Connect dan kirim permohonan akses. Jika email sudah terdaftar, gunakan akun yang sudah ada.",
          );
          return;
        }
        setAuthReady(true);
      }
      const { error } = await sb.rpc("submit_registration", values);
      if (error) throw error;
      window.location.assign("/access");
    } catch (err) {
      setError(err.message || "Pendaftaran belum berhasil. Silakan coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) {
      setError("Gagal keluar. Silakan coba lagi.");
      setBusy(false);
    } else window.location.assign("/login");
  }
  const initial = application
    ? {
        p_full_name: application.full_name,
        p_phone: application.phone,
        p_job_title: application.requested_job_title,
        p_department_code: application.requested_department_code || "",
        p_account_type: application.account_type,
        p_tenant_name: application.tenant_name,
        p_unit_number: application.unit_number,
      }
    : defaults;
  return (
    <main className="registration-page">
      <AuthBackdrop />
      <a className="brand" href="/login">
        <span className="brand-icon">
          <ArrowUpRight />
        </span>
        <span>
          P-Ex <b>Connect</b>
          <small>PEKANBARU XCHANGE</small>
        </span>
      </a>
      <section className="registration-card">
        <div className="registration-icon">
          {status === "pending" ? <ShieldCheck /> : <UserRoundPlus />}
        </div>
        <div className="eyebrow teal">AKSES PEKANBARU XCHANGE</div>
        <h1>
          {status === "pending"
            ? "Menunggu persetujuan admin"
            : status === "inactive"
              ? "Akses Anda dinonaktifkan"
              : status === "rejected"
                ? "Permohonan belum disetujui"
                : accessState
                  ? "Ajukan akses Mall"
                  : "Daftar P-Ex Connect"}
        </h1>
        <p>
          {status === "pending"
            ? "Permohonan Anda sudah tercatat. Admin akan memeriksa jabatan, departemen, dan peran akses sebelum mengaktifkan akun."
            : status === "inactive"
              ? "Hubungi administrator mall untuk mengaktifkan kembali keanggotaan Anda."
              : accessState
                ? "Lengkapi data berikut untuk ditinjau oleh administrator mall."
                : "Buat akun dan ajukan akses untuk bergabung dengan tim operasional."}
        </p>
        <div className="approval-steps">
          <span>1. Registrasi</span>
          <ArrowRight size={14} />
          <span>2. Persetujuan admin</span>
          <ArrowRight size={14} />
          <span>3. Akses aktif</span>
        </div>
        {application?.review_notes && (
          <div className="alert">Catatan admin: {application.review_notes}</div>
        )}
        {status === "pending" && (
          <div className="application-summary">
            <strong>{application?.full_name}</strong>
            <span>{application?.email}</span>
            <span>
              Departemen diajukan: {application?.requested_department_name}
            </span>
            <span>Jabatan diajukan: {application?.requested_job_title}</span>
            <small>Departemen final akan ditetapkan oleh admin.</small>
          </div>
        )}
        {success ? (
          <div className="resolution" role="status">
            <CheckCheck size={20} />
            {success}
          </div>
        ) : (
          canApply && (
            <form onSubmit={submit}>
              {!accessState && (
                <>
                  <label>
                    Email *
                    <input
                      name="email"
                      disabled={authReady}
                      type="email"
                      required
                      autoComplete="email"
                      maxLength={254}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Kata sandi *
                      <input
                        name="password"
                        disabled={authReady}
                        type="password"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      Konfirmasi kata sandi *
                      <input
                        name="confirm"
                        disabled={authReady}
                        type="password"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                      />
                    </label>
                  </div>
                  <p className="account-hint">
                    Minimal 12 karakter. Sudah punya akun perusahaan? Login
                    dengan akun tersebut untuk mengajukan akses Mall.
                  </p>
                </>
              )}
              {authReady && !accessState && (
                <p className="resolution" role="status">
                  Akun sudah dibuat. Anda dapat mengirim ulang permohonan akses
                  jika proses sebelumnya belum selesai.
                </p>
              )}
              <RegistrationFields defaults={initial} />
              <p className="registration-note">
                <ShieldCheck size={18} />
                Departemen dan jabatan yang Anda isi adalah usulan. Admin
                menetapkan departemen final serta hak akses sebelum akun aktif.
              </p>
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Memproses..."
                  : authReady
                    ? "Kirim permohonan akses"
                    : "Daftar dan ajukan akses"}
                <ArrowRight size={17} />
              </button>
            </form>
          )
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <div className="registration-footer">
          {accessState ? (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={16} />
                Periksa status
              </button>
              <button className="text-button" disabled={busy} onClick={logout}>
                <LogOut size={16} />
                Keluar
              </button>
            </>
          ) : (
            <span>
              Sudah punya akun? <a href="/login">Masuk di sini</a>
            </span>
          )}
        </div>
      </section>
      <footer>P-Ex Connect · Pekanbaru XChange</footer>
    </main>
  );
}
