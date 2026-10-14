"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  UserRoundCog,
  UserRoundPlus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { roles, jobTitles } from "@/lib/registration.mjs";
const formatDate = (value) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
function AccessFields({ departments, member = null, request = null }) {
  const [role, setRole] = useState(
    member?.role || request?.account_type || "staff",
  );
  return (
    <div className="member-fields">
      <label>
        Peran akses
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {Object.entries(roles).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Departemen final *
        <select
          name="department"
          required
          defaultValue={member?.department_id || ""}
        >
          <option value="" disabled>
            Admin memilih departemen
          </option>
          {departments
            .filter((d) => d.is_active)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Jabatan final *
        <input
          name="job_title"
          list="member-job-options"
          required
          minLength={2}
          maxLength={100}
          defaultValue={member?.job_title || request?.requested_job_title || ""}
          placeholder="Pilih atau ketik jabatan"
        />
      </label>
      {member && (
        <label>
          Status akses
          <select
            name="active"
            defaultValue={member.is_active ? "true" : "false"}
          >
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
      )}
    </div>
  );
}
function RequestCard({ request, departments, save }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const decision = e.nativeEvent.submitter?.value || "approved";
    try {
      const { error } = await createClient().rpc("review_registration", {
        p_user_id: request.user_id,
        p_expected_updated_at: request.updated_at,
        p_decision: decision,
        p_role: f.get("role"),
        p_department_id: f.get("department") || null,
        p_job_title: f.get("job_title"),
        p_notes: f.get("notes") || null,
      });
      if (error) throw error;
      save(
        decision === "approved"
          ? "Pengguna disetujui. Departemen dan jabatan final sudah ditetapkan."
          : "Permohonan ditolak dengan catatan untuk pendaftar.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="member-card">
      <header>
        <div>
          <h3>{request.full_name}</h3>
          <p>
            {request.email} · {request.phone}
          </p>
        </div>
        <span
          className={`badge ${request.status === "approved" ? "resolved" : request.status === "rejected" ? "rejected" : "pending"}`}
        >
          {request.status === "approved"
            ? "Disetujui"
            : request.status === "rejected"
              ? "Ditolak"
              : "Menunggu"}
        </span>
      </header>
      <div className="requested-info">
        <strong>Usulan pendaftar</strong>
        <span>
          Departemen:{" "}
          {departments.find((d) => d.id === request.requested_department_id)
            ?.name || "Tidak tersedia"}
        </span>
        <span>Jabatan: {request.requested_job_title}</span>
        <span>
          Jenis: {request.account_type === "tenant" ? "Tenant" : "Staf mall"}
          {request.tenant_name
            ? ` · ${request.tenant_name} / ${request.unit_number}`
            : ""}
        </span>
        <small>Diajukan {formatDate(request.created_at)} WIB</small>
      </div>
      {request.status === "pending" ? (
        <form onSubmit={submit}>
          <div className="review-heading">
            <ShieldCheck size={17} />
            <strong>Verifikasi dan tetapkan akses final</strong>
          </div>
          <p className="account-hint">
            Departemen final wajib dipilih admin, meskipun sama dengan usulan
            pendaftar.
          </p>
          <AccessFields departments={departments} request={request} />
          <label>
            Catatan keputusan
            <textarea
              name="notes"
              maxLength={2000}
              rows={2}
              placeholder="Wajib diisi minimal 5 karakter jika menolak permohonan."
            />
          </label>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <div className="member-actions">
            <button
              className="secondary"
              name="decision"
              value="rejected"
              formNoValidate
              disabled={busy}
            >
              <X size={16} />
              Tolak
            </button>
            <button
              className="primary"
              name="decision"
              value="approved"
              disabled={busy}
            >
              <Check size={16} />
              {busy ? "Menyimpan..." : "Setujui dan aktifkan"}
            </button>
          </div>
        </form>
      ) : (
        <p className="review-result">
          Ditinjau {request.reviewed_at ? formatDate(request.reviewed_at) : "—"}{" "}
          WIB{request.review_notes ? ` · ${request.review_notes}` : ""}
        </p>
      )}
    </article>
  );
}
function MemberCard({ member, departments, save, self }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const { error } = await createClient().rpc("update_member", {
        p_id: member.id,
        p_expected_updated_at: member.updated_at,
        p_role: f.get("role"),
        p_department_id: f.get("department") || null,
        p_job_title: f.get("job_title"),
        p_is_active: f.get("active") === "true",
      });
      if (error) throw error;
      save("Jabatan, departemen, dan akses pengguna berhasil diperbarui.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="member-card">
      <header>
        <div>
          <h3>
            {member.full_name}
            {self ? " (Anda)" : ""}
          </h3>
          <p>{member.email}</p>
        </div>
        <span className={`badge ${member.is_active ? "resolved" : "rejected"}`}>
          {member.is_active ? "Aktif" : "Nonaktif"}
        </span>
      </header>
      <form onSubmit={submit}>
        <AccessFields departments={departments} member={member} />
        {self && (
          <p className="account-hint">
            Akses admin sendiri tidak dapat dicabut dari menu ini.
          </p>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button className="secondary" disabled={busy}>
          <Check size={16} />
          {busy ? "Menyimpan..." : "Simpan akses pengguna"}
        </button>
      </form>
    </article>
  );
}
export default function Members({ profile, departments }) {
  const [requests, setRequests] = useState([]),
    [members, setMembers] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("requests"),
    [status, setStatus] = useState("pending"),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sb = createClient();
      async function all(table) {
        const rows = [];
        for (let n = 0; ; n += 500) {
          const { data, error } = await sb
            .from(table)
            .select("*")
            .order("created_at", { ascending: false })
            .order(table === "profiles" ? "id" : "user_id")
            .range(n, n + 499);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) return rows;
        }
      }
      const [r, m] = await Promise.all([
        all("registration_requests"),
        all("profiles"),
      ]);
      setRequests(r);
      setMembers(m);
    } catch {
      setError(
        "Daftar pengguna gagal dimuat. Pastikan Anda masih memiliki akses admin, lalu coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (profile.role !== "admin") return null;
  const save = (message) => {
    setNotice(message);
    load();
  };
  const pending = requests.filter((r) => r.status === "pending").length;
  const rows = (
    tab === "requests"
      ? requests.filter((r) => !status || r.status === status)
      : members
  ).filter((r) =>
    `${r.full_name} ${r.email} ${r.job_title || r.requested_job_title || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="members-panel">
      <header className="tracker-heading">
        <div>
          <h2>Pengguna & persetujuan</h2>
          <p>Verifikasi pendaftaran dan kelola akses tim Mall.</p>
        </div>
        <button className="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          Muat ulang
        </button>
      </header>
      <div className="member-toolbar">
        <div className="view-toggle">
          <button
            className={tab === "requests" ? "selected" : ""}
            onClick={() => setTab("requests")}
          >
            <UserRoundPlus size={16} />
            Pendaftaran ({pending})
          </button>
          <button
            className={tab === "members" ? "selected" : ""}
            onClick={() => setTab("members")}
          >
            <UserRoundCog size={16} />
            Pengguna ({members.length})
          </button>
        </div>
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Cari pengguna"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau jabatan..."
          />
        </div>
        {tab === "requests" && (
          <select
            aria-label="Status pendaftaran"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="pending">Menunggu persetujuan</option>
            <option value="approved">Disetujui</option>
            <option value="rejected">Ditolak</option>
            <option value="">Semua pendaftaran</option>
          </select>
        )}
      </div>
      <datalist id="member-job-options">
        {jobTitles.map((j) => (
          <option key={j} value={j} />
        ))}
      </datalist>
      {notice && (
        <div className="resolution" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty">
          <p>Memuat pengguna...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <ShieldCheck size={29} />
          <h3>
            {tab === "requests"
              ? "Tidak ada pendaftaran pada filter ini"
              : "Tidak ada pengguna yang cocok"}
          </h3>
          <p>Gunakan Muat ulang untuk memeriksa data terbaru.</p>
        </div>
      ) : (
        <div className="member-list">
          {rows.map((row) =>
            tab === "requests" ? (
              <RequestCard
                key={`${row.user_id}:${row.updated_at}`}
                request={row}
                departments={departments}
                save={save}
              />
            ) : (
              <MemberCard
                key={`${row.id}:${row.updated_at}`}
                member={row}
                departments={departments}
                save={save}
                self={row.id === profile.id}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
