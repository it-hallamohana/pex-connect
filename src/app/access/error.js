"use client";
export default function Error({ reset }) {
  return (
    <main className="registration-page">
      <section className="registration-card">
        <h1>Status akses belum tersedia</h1>
        <p>
          Periksa koneksi lalu coba lagi. Hubungi administrator jika kendala
          berlanjut.
        </p>
        <button className="primary" onClick={reset}>
          Coba lagi
        </button>
        <a className="secondary" href="/login">
          Kembali ke login
        </a>
      </section>
    </main>
  );
}
