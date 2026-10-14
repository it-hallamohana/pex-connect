"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
export default function Login() {
  const params = useSearchParams();
  const [error, setError] = useState(
    params.get("reason") === "confirmation"
      ? "Tautan verifikasi tidak dapat diproses di browser ini. Jika email sudah terverifikasi, silakan login untuk melanjutkan permohonan akses."
      : "",
  );
  const [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const sb = createClient();
      const { error } = await sb.auth.signInWithPassword({
        email: form.get("email"),
        password: form.get("password"),
      });
      if (error)
        throw new Error(
          "Email atau kata sandi tidak sesuai, atau layanan belum tersedia.",
        );
      window.location.assign("/access");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="brand" href="/login">
          <span className="brand-icon">
            <ArrowUpRight />
          </span>
          <span>
            P-Ex <b>Connect</b>
            <small>PEKANBARU XCHANGE</small>
          </span>
        </a>
        <div className="story-copy">
          <div className="eyebrow">
            <span className="tiny-line" /> ONE MALL. ONE CONNECTED TEAM.
          </div>
          <h1>
            Operasional lebih
            <br />
            terarah.
            <br />
            <span>Pengalaman lebih baik.</span>
          </h1>
          <p>
            Setiap laporan, setiap tindak lanjut, setiap hari.
            <br />
            Bersama menjaga Pekanbaru XChange.
          </p>
        </div>
        <div className="mall-art" aria-hidden="true">
          <div className="art-ring" />
          <div className="building b1" />
          <div className="building b2" />
          <div className="building b3" />
          <div className="art-label">
            PEKANBARU <strong>XCHANGE</strong>
          </div>
        </div>
        <div className="story-footer">
          <Building2 size={16} /> Pusat koordinasi operasional mall{" "}
          <span>EST. 2026</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <div className="eyebrow teal">PORTAL OPERASIONAL</div>
          <h2>Selamat datang kembali.</h2>
          <p>Masuk untuk mulai mengelola operasional Anda.</p>
          <form onSubmit={login}>
            <label>
              Email kerja
              <input
                name="email"
                type="email"
                placeholder="nama@perusahaan.com"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Kata sandi
              <div className="password">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  placeholder="Masukkan kata sandi"
                  autoComplete="current-password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  aria-label={
                    show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                  }
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Memverifikasi..." : "Masuk ke P-Ex Connect"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="register-link">
            Belum punya akun? <a href="/register">Daftar P-Ex Connect</a>
          </p>
          <div className="secure-note">
            <ShieldCheck size={19} />
            <span>
              Akses terbatas untuk staf dan tenant terdaftar.
              <br />
              Akses operasional aktif setelah persetujuan admin.
            </span>
          </div>
        </div>
        <footer>
          P-Ex Connect <span>{new Date().getFullYear()} Pekanbaru XChange</span>
        </footer>
      </section>
    </main>
  );
}
