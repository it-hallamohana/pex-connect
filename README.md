# P-Ex Connect

Portal operasional Pekanbaru XChange Mall. Next.js App Router, React 19, Tailwind CSS, Lucide, Supabase Auth/PostgreSQL/Storage/Realtime. Semua data operasional berada di schema `mall` pada project Supabase `hotel-ops`.

## Menjalankan

Node.js 22 atau lebih baru.

```powershell
npm ci
# Isi .env.local menggunakan .env.example (sudah dikonfigurasi pada komputer ini).
npm run dev -- --port 3005
```

Buka http://127.0.0.1:3005. `npm run build` menghasilkan build standalone dan `npm test` menjalankan unit test serta integrasi PostgreSQL lokal melalui PGlite. Test tidak menggunakan Supabase produksi.

## Isolasi dan keamanan

- Browser, server, dan client Storage menggunakan default database schema `mall`.
- Tidak ada query atau DDL terhadap tabel schema `public`. Tidak ada trigger pada `auth.users`.
- Registrasi tersedia pada `/register`. Pendaftar masuk ke `mall.registration_requests` dengan status pending; akses operasional baru aktif setelah admin menyetujui dan membuat keanggotaan di `mall.profiles`. Tidak ada sinkronisasi otomatis seluruh akun hotel.
- Cookie bernama `pex-mall-auth` memisahkan sesi aplikasi ini dari aplikasi lain dalam project yang sama. Logout memakai scope lokal.
- Admin melihat dan mengelola seluruh tiket. Supervisor/staf melihat tiket departemennya dan tiket yang dilaporkan sendiri. Tenant hanya melihat tiketnya sendiri.
- Hanya admin/supervisor yang boleh menentukan petugas dan menutup/menolak tiket. Petugas harus aktif dan berada di departemen tujuan.
- Penulisan tiket hanya melalui RPC yang memvalidasi otorisasi. Client tidak diberi izin INSERT/UPDATE/DELETE pada tabel; log audit dibuat oleh fungsi tersebut dalam transaksi yang sama.
- RLS berlaku pada semua tabel Mall. Fungsi privileged menggunakan search_path kosong, pemeriksaan auth.uid dan profil aktif, serta EXECUTE terbatas. Helper membership mengembalikan hanya identitas pemanggil; tidak menerima user ID arbitrer.
- Foto disimpan pada bucket privat `mall-attachments`. Kolom `photo_url` dan `resolution_photo_url` berisi **object path**, bukan URL publik atau URL bertanda tangan yang akan kedaluwarsa.
- Upload dan signed URL dilakukan melalui `/api/attachments` setelah validasi profil/akses tiket. Service role tidak pernah diimpor ke client browser. Tidak ada perubahan policy Storage milik hotel.
- `SUPABASE_SERVICE_ROLE_KEY` tetap kunci project yang luas: simpan hanya pada environment server. Kode runtime memakainya hanya untuk bucket Mall.
- Waktu statistik dan nomor tiket menggunakan Asia/Jakarta. Counter tiket atomik dan pengecekan `updated_at` mencegah benturan nomor serta penimpaan perubahan rekan.

## Database

`mall_schema_init.sql` adalah migrasi inisialisasi **sekali jalan**, transaksional. Telah diterapkan pada project `uumehoxkmfapdwruzdrx`; jangan jalankan ulang pada project ini. Jika schema sudah berisi objek, CREATE TABLE akan menggagalkan transaksi alih-alih menimpa objek lama.

Mencakup departments, profiles, requests, request_logs, ticket_counters, indeks, RLS, RPC, seed enam departemen dan penambahan hanya tabel Mall ke publication Realtime yang ada. Jangan memakai `supabase db reset`, pull semua schema, atau push massal pada project bersama.

Pada project baru, jalankan SQL ini di SQL Editor. Tambahkan `mall` pada **Data API → Exposed schemas**, dengan mempertahankan daftar schema yang sudah ada. Buat bucket privat `mall-attachments`, limit 5 MB, MIME `image/jpeg`, `image/png`, `image/webp`. Gunakan Storage Dashboard/API, bukan DDL atas schema Storage.

## Menambahkan anggota

Gunakan alur registrasi dan menu **Pengguna** untuk operasional sehari-hari:

1. Calon pengguna mengisi nama, email, kata sandi, telepon, jenis pengguna, **departemen yang diajukan**, dan **jabatan yang diajukan** di `/register`. Akun Auth perusahaan yang sudah ada cukup login, lalu mengajukan akses dari `/access`.
2. Jika konfigurasi Auth mewajibkan verifikasi email, pengguna perlu memverifikasi email terlebih dahulu, kemudian login dan mengirim permohonan dari `/access`. Konfigurasi Auth project bersama tidak diubah aplikasi ini.
3. Admin membuka **Pengguna → Pendaftaran**. Departemen yang diajukan ditampilkan sebagai referensi. Admin **wajib memilih departemen final secara eksplisit**, termasuk ketika sama dengan usulan pendaftar, kemudian menetapkan jabatan final dan peran akses.
4. Klik **Setujui dan aktifkan**, atau **Tolak** disertai alasan minimal 5 karakter. Pendaftar dapat memeriksa status, membaca catatan penolakan, dan mengajukan ulang.
5. Setelah persetujuan, admin tetap dapat mengubah departemen, jabatan, peran, atau status aktif melalui tab **Pengguna**. Menonaktifkan anggota hanya mencabut akses Mall, tanpa menonaktifkan akun Auth perusahaan.

Jabatan adalah label organisasi (contoh: General Manager, Chief Engineering, Supervisor, Teknisi). Peran akses tetap `admin`, `supervisor`, `staff`, atau `tenant`. Jabatan tidak otomatis meningkatkan izin pengguna. Admin tidak dapat menonaktifkan atau menurunkan peran adminnya sendiri.

Persetujuan dan perubahan anggota dicatat di `mall.member_logs`. Data usulan departemen tetap disimpan, terpisah dari departemen final pada profil. Pembaruan menggunakan pemeriksaan versi dan transaksi untuk mencegah dua admin menimpa keputusan satu sama lain. Gunakan **Muat ulang** untuk mengambil antrean terkini; form tidak melakukan refresh otomatis agar isian admin tidak hilang.

Migrasi tambahan: `supabase/migrations/20261014014212_mall_registration_approval.sql`. Jalankan **setelah** `mall_schema_init.sql` untuk instalasi baru. Keduanya sudah diterapkan pada project ini; jangan jalankan ulang atau melakukan push/reset massal project bersama. Tidak ada trigger baru di Auth dan tidak ada tabel hotel yang diakses.

Saat deploy, tambahkan URL `https://DOMAIN-P-EX/auth/callback` pada allowlist Redirect URLs Supabase jika verifikasi email diaktifkan. Pertahankan Site URL, template email, dan semua URL hotel yang sudah ada. Callback PKCE tersedia; jika tautan dikonfirmasi di browser berbeda, pengguna dapat kembali login setelah email terverifikasi.

### Provisioning manual (opsional)

Untuk user Auth yang sudah ada, administrator database dapat menjalankan SQL berikut dengan email, nama, peran, dan departemen yang sesuai. Ini hanya menambahkan keanggotaan Mall; tidak mengubah user hotel.

```sql
INSERT INTO mall.profiles (id, full_name, email, role, department_id)
SELECT u.id, 'Nama Staf', u.email, 'staff', d.id
FROM auth.users u CROSS JOIN mall.departments d
WHERE lower(u.email) = lower('staf@example.com') AND d.code = 'ENG';
```

Role yang tersedia: `admin`, `supervisor`, `staff`, `tenant`. Staf dan supervisor wajib memiliki departemen. Tenant dapat memiliki `tenant_name` dan `unit_number`. Menonaktifkan `mall.profiles.is_active` mencabut akses data Mall pada permintaan berikutnya tanpa mengubah akun hotel. Jangan menghapus akun Auth bersama untuk sekadar menonaktifkan akses Mall.

Untuk akun Auth baru, buat melalui Dashboard/Auth Admin API. Sebelum provisioning di masa depan, periksa kembali apakah terdapat trigger Auth baru yang otomatis menulis ke sistem hotel. Saat admin pertama dibuat, pemeriksaan metadata tidak menemukan trigger aplikasi pada `auth.users`.

## Alur penggunaan

1. Login menggunakan akun Mall. Ubah kata sandi awal pada menu **Akun**.
2. **Buat tiket**: judul, kategori, departemen, area/lokasi, prioritas, deskripsi, dan foto opsional.
3. Buka tiket untuk penugasan, komentar, dan perubahan status.
4. Alur normal: Menunggu → Dikerjakan → Terselesaikan → Ditutup. Penyelesaian wajib catatan minimal 5 karakter dan foto. Supervisor/admin dapat menolak tiket Menunggu disertai alasan, atau membuka kembali tiket Terselesaikan ke Dikerjakan.
5. Gunakan filter, pencarian, tabel, atau Board. Klik kartu Board untuk mengubah status menggunakan dropdown.

Realtime memantau channel `mall:operations:<user-id>` untuk tabel Mall. Saat koneksi kembali, data dimuat ulang. Polling 60 detik menjadi fallback. Riwayat detail juga diperbarui; formulir aktif mempertahankan versi tiket sehingga konflik akan meminta pengguna **Muat terbaru**.

## Deploy Railway

Repository ini menyediakan `Dockerfile`, `.dockerignore`, dan `railway.json`.

1. Buat service Railway untuk repository/direktori ini; gunakan builder Dockerfile.
2. Tambahkan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` pada service **P-Ex Connect**.
3. Dua variabel `NEXT_PUBLIC_` harus tersedia sebagai build arguments. Dockerfile mendeklarasikan ARG tersebut; Railway memasok variabel service saat build. Kunci service role diperlukan hanya saat runtime.
4. Railway memasok `PORT`; server standalone mendengarkan `0.0.0.0`. Healthcheck `/api/health` memeriksa proses aplikasi, bukan kesehatan database.
5. Generate domain Railway, lalu uji login, buat tiket, upload foto, realtime, dan logout melalui domain itu. Jangan mengganti Site URL global Supabase milik hotel; login password aplikasi ini tidak memerlukannya.

Belum ada deployment Railway yang dibuat dari sesi ini. Docker image disiapkan, tetapi belum diuji melalui Docker daemon di komputer ini.

## Pengujian dan batas Fase 1

`tests/database.test.mjs` menjalankan SQL migrasi asli pada PostgreSQL lokal sementara dengan Auth mock: isolasi schema, akun tanpa keanggotaan, anggota nonaktif, pembatasan tenant/departemen, larangan tulis langsung, alur status, foto wajib, konflik versi, serta integritas audit.

Fase 1 belum mencakup push notification/email operasional, SLA otomatis, ekspor laporan, atau multi-mall. Unggahan yang dibatalkan sebelum tiket tersimpan dapat menjadi file yatim; tidak ada penghapusan otomatis pada bucket produksi. Daftar tiket dimuat bertahap per 500 baris ke browser dan ditampilkan 12 per halaman; untuk volume sangat besar, pindahkan agregasi/filter ke server sebelum perluasan penggunaan.

Referensi: [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Acuan resmi Mall dan MOD

Daftar hotel pada migrasi sebelumnya telah diganti oleh `20261014141836_mall_source_catalog_mod.sql`. Sumber: [Checklist PX - Connect](https://docs.google.com/spreadsheets/d/1oUImJKAI1KMF-CMBnnFR7QxbtBWwm-SyhB3MVyYCI5I/edit?gid=1457178504), tab MOD, Operasional Mall, dan Leader Photo.

Enam divisi operasional: General Affair, Human Resource, Legal Department, Engineering, Marketing, Marcomm; MOD ditambahkan untuk penempatan petugas pemeriksaan. Subarea House Keeping, Security, dan Customer Service berada pada General Affair. Departemen terdahulu dinonaktifkan, bukan dihapus, sehingga relasi profil dan riwayat tetap utuh. Admin dapat memindahkan pengguna lama melalui menu Pengguna.

Form request memilih departemen, area operasional, lalu kebutuhan dari spreadsheet. Customer Service tidak memiliki butir kebutuhan pada dokumen, sehingga hanya menyediakan Lainnya. Lokasi/zona mengacu pada tab MOD. Tidak ada lagi judul request hotel. Data katalog tersimpan di `src/lib/mall-catalog.mjs`; pembaruan spreadsheet tidak tersinkron otomatis.

Menu MOD menampilkan 7 leader dan 117 butir pemeriksaan. Admin, supervisor, dan staf departemen MOD dapat membuat pemeriksaan dan menyimpan draft. Semua butir harus dijawab (Baik, Perlu tindak lanjut, atau Tidak berlaku) sebelum dikirim; temuan wajib diberi catatan. Hasil terkirim tidak dapat diedit. Admin dapat membaca semua hasil; pengisi hanya dapat membaca/memperbarui miliknya sendiri. Pemilihan leader adalah label penanggung jawab pemeriksaan, tidak memberikan role atau membuat akun Auth. Tidak ada jadwal piket otomatis karena sumber tidak memuat jadwal.

Tombol Buat request tindak lanjut membuka formulir dengan judul, lokasi, dan catatan temuan; pengguna memilih divisi/area tujuan lalu mengirim request. Draft checklist disimpan terpisah.

Foto leader diekstrak dari posisi gambar pada tab Leader Photo dan disimpan privat di `mall-attachments/leaders/source-v1-N.jpg`. Foto hanya disajikan lewat route `/api/leaders/photo` setelah pemeriksaan profil Mall aktif. File foto tidak masuk repository publik. Untuk instalasi baru, unggah 7 foto sumber ke path tersebut melalui kredensial server; migrasi menyimpan referensinya.

Label Open memakai nilai internal `pending`, agar kompatibel dengan tiket/RPC lama. Data dashboard tetap mengikuti RLS. Login dan registrasi memiliki background ilustrasi garis atrium, dengan kartu formulir putih dan tipografi utama 16px.

Urutan migrasi: init schema, attachment validation, registration approval, foxi_departments (historis), lalu source_catalog_mod (acuan terbaru). Jangan menjalankan kembali migrasi foxi_departments setelah source_catalog_mod. Seluruh objek bisnis tetap di schema `mall`; schema `public` dan bucket hotel tidak disentuh.
