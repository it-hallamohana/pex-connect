"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  LayoutDashboard,
  Ticket,
  Building2,
  LogOut,
  Plus,
  Clock3,
  CheckCheck,
  MapPin,
  X,
  Upload,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  MessageSquare,
  UserRound,
  Menu,
  Check,
  LoaderCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import OperationsDashboard from "@/components/operations-dashboard";
import RequestTracker from "@/components/request-tracker";
import DutyCard from "@/components/duty";
import { canDashboard, isAdministrator, roles } from "@/lib/registration.mjs";
import ModPanel from "@/components/mod-panel";
import { mallCatalog } from "@/lib/mall-catalog.mjs";
import { requestTitles, operationalAreas } from "@/lib/request-titles.mjs";
import Account from "@/components/account";
import Members from "@/components/members";
import {
  statuses,
  priorities,
  locations,
  canManage,
  transitions,
} from "@/lib/domain.mjs";
const fmt = (value) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
function Badge({ value, priority = false }) {
  return (
    <span className={`badge ${value}`}>
      <i />
      {(priority ? priorities : statuses)[value]}
    </span>
  );
}
function Modal({ title, subtitle, close, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <div className="eyebrow teal">P-EX CONNECT</div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Tutup dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
async function upload(file) {
  if (!file?.size) return null;
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/attachments", {
    method: "POST",
    body: form,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.path;
}
function PhotoInput({ name = "photo", required = false }) {
  return (
    <label className="upload">
      <Upload size={21} />
      <strong>{required ? "Foto hasil pekerjaan *" : "Foto kendala"}</strong>
      <span>JPG, PNG, WebP · Maks. 5 MB</span>
      <input
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required}
      />
    </label>
  );
}
function NewTicket({ departments, close, done, initial = {} }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [destination, setDestination] = useState("");
  const [titleChoice, setTitleChoice] = useState(
    initial.title ? "Lainnya" : "",
  );
  const [area, setArea] = useState("");
  const [selectedFloor, setSelectedFloor] = useState(
    initial.floor || locations[0],
  );
  const code = departments.find((d) => d.id === destination)?.code;
  const areaOptions = operationalAreas(code);
  const titleOptions = requestTitles(code, area);
  const photoPath = useRef(null),
    photoFile = useRef(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const file = f.get("photo");
      if (
        file?.size &&
        (!photoPath.current ||
          photoFile.current !==
            `${file.name}:${file.size}:${file.lastModified}`)
      ) {
        photoPath.current = await upload(file);
        photoFile.current = `${file.name}:${file.size}:${file.lastModified}`;
      }
      const { error } = await createClient().rpc("create_request", {
        p_title: titleChoice === "Lainnya" ? f.get("title") : titleChoice,
        p_description: f.get("description"),
        p_category: area,
        p_location: `${f.get("floor")} · ${f.get("location")}`,
        p_priority: f.get("priority"),
        p_department: f.get("department"),
        p_photo: file?.size ? photoPath.current : null,
      });
      if (error) throw error;
      done("Tiket berhasil dibuat. Tim tujuan dapat segera menindaklanjuti.");
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Buat request baru"
      subtitle="Isi kebutuhan dan kirim ke departemen tujuan."
      close={() => !busy && close()}
    >
      <form onSubmit={submit}>
        <label>
          Departemen tujuan *
          <select
            name="department"
            required
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setArea("");
              setTitleChoice(initial.title ? "Lainnya" : "");
            }}
          >
            <option value="" disabled>
              Pilih departemen
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
          Area operasional *
          <select
            required
            name="operation_area"
            value={area}
            disabled={!destination}
            onChange={(e) => {
              setArea(e.target.value);
              setTitleChoice(initial.title ? "Lainnya" : "");
            }}
          >
            <option value="" disabled>
              Pilih area operasional
            </option>
            {areaOptions.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        {area && titleOptions.length === 1 && (
          <p className="account-hint">
            Dokumen belum memuat pilihan kebutuhan untuk area ini. Pilih Lainnya
            dan tuliskan kebutuhan.
          </p>
        )}
        <label>
          Judul request *
          <select
            required
            disabled={!area}
            value={titleChoice}
            onChange={(e) => setTitleChoice(e.target.value)}
          >
            <option value="" disabled>
              {destination
                ? "Pilih kebutuhan"
                : "Pilih departemen terlebih dahulu"}
            </option>
            {titleOptions.map((title) => (
              <option key={title}>{title}</option>
            ))}
          </select>
        </label>
        {titleChoice === "Lainnya" && (
          <label>
            Judul lainnya *
            <input
              name="title"
              required
              minLength={5}
              maxLength={160}
              defaultValue={initial.title || ""}
              placeholder="Tuliskan kebutuhan Anda"
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            Lantai / zona *
            <select
              name="floor"
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Lokasi spesifik *
            <input
              name="location"
              list="mall-locations"
              defaultValue={initial.location || ""}
              placeholder="Koridor timur / Unit 12B"
              maxLength={120}
              required
            />
          </label>
        </div>
        <datalist id="mall-locations">
          {[
            ...new Set(
              mallCatalog.modItems
                .filter((i) => i.floor === selectedFloor)
                .map((i) => i.area),
            ),
          ].map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <label>
          Prioritas *
          <select name="priority" defaultValue="medium">
            {Object.entries(priorities).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deskripsi detail *
          <textarea
            name="description"
            defaultValue={initial.description || ""}
            rows={3}
            minLength={10}
            maxLength={5000}
            placeholder="Jelaskan kendala dan bantuan yang diperlukan..."
            required
          />
        </label>
        <PhotoInput />
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            Batal
          </button>
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}{" "}
            {busy ? "Menyimpan..." : "Kirim request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Detail({
  ticket,
  profile,
  people,
  departments,
  close,
  done,
  revision,
}) {
  const [logs, setLogs] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(ticket.status),
    [comment, setComment] = useState("");
  const [current, setCurrent] = useState(ticket);
  const photoPath = useRef(null),
    photoSignature = useRef(null);
  const manage = canManage(profile, current),
    next = transitions(current.status, profile.role),
    admin = canDashboard(profile.role);
  useEffect(() => {
    let active = true;
    createClient()
      .from("request_logs")
      .select("*")
      .eq("request_id", ticket.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (active) {
          if (error) setError("Riwayat gagal dimuat.");
          else setLogs(data || []);
        }
      });
    return () => {
      active = false;
    };
  }, [ticket.id, revision, current.updated_at]);
  async function update(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      let photo = null;
      const file = f.get("photo");
      if (status === "resolved" && status !== current.status) {
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (!photoPath.current || photoSignature.current !== signature) {
          photoPath.current = await upload(file);
          photoSignature.current = signature;
        }
        photo = photoPath.current;
      }
      const { data, error } = await createClient().rpc("update_request", {
        p_id: current.id,
        p_expected_updated_at: current.updated_at,
        p_status: status,
        p_assigned_to: admin ? f.get("assignee") || null : current.assigned_to,
        p_notes: f.get("notes") || null,
        p_photo: photo,
      });
      if (error) throw error;
      setCurrent(data);
      done("Perubahan tiket berhasil disimpan.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const { data, error } = await createClient()
        .from("requests")
        .select("*")
        .eq("id", ticket.id)
        .single();
      if (error) throw error;
      setCurrent(data);
      setStatus(data.status);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function addComment(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().rpc("add_comment", {
        p_id: ticket.id,
        p_notes: comment,
      });
      if (error) throw error;
      setComment("");
      done("Komentar ditambahkan.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={current.title}
      subtitle={current.ticket_number}
      close={() => !busy && close()}
    >
      <div className="detail-meta">
        <Badge value={current.status} />
        <Badge value={current.priority} priority />
        <button className="text-button" onClick={refresh} disabled={busy}>
          <RefreshCw size={14} />
          Muat terbaru
        </button>
      </div>
      <p className="detail-description">{current.description}</p>
      <div className="detail-facts">
        <span>
          <Building2 size={16} />
          Pengirim:{" "}
          {departments.find((d) => d.id === current.reported_department_id)
            ?.name || "Tanpa departemen / Tenant"}
        </span>
        <span>
          <Ticket size={16} />
          {current.category}
        </span>
        <span>
          <MapPin size={16} />
          {current.location}
        </span>
        <span>
          <Building2 size={16} />
          Tujuan:{" "}
          {departments.find((d) => d.id === current.department_id)?.name}
        </span>
        <span>
          <Clock3 size={16} />
          {fmt(current.created_at)} WIB
        </span>
      </div>
      <div className="photos">
        {[
          ["photo_url", "Foto kendala"],
          ["resolution_photo_url", "Foto penyelesaian"],
        ]
          .filter(([k]) => current[k])
          .map(([k, label]) => (
            <a
              key={k}
              target="_blank"
              rel="noreferrer"
              href={`/api/attachments?request=${current.id}&kind=${k}`}
            >
              <img
                src={`/api/attachments?request=${current.id}&kind=${k}`}
                alt={label}
              />
              <span>
                {label}
                <ArrowUpRight size={14} />
              </span>
            </a>
          ))}
      </div>
      {current.resolution_notes && (
        <div className="resolution">
          <CheckCheck size={18} />
          <div>
            <strong>Catatan penyelesaian</strong>
            <p>{current.resolution_notes}</p>
          </div>
        </div>
      )}
      {manage && (
        <form onSubmit={update} className="detail-form">
          <h3>Tindak lanjut</h3>
          <div className="form-grid">
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value={current.status}>
                  {statuses[current.status]}
                </option>
                {next.map((s) => (
                  <option key={s} value={s}>
                    {statuses[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Petugas
              {admin ? (
                <select
                  key={current.updated_at}
                  name="assignee"
                  defaultValue={current.assigned_to || ""}
                >
                  <option value="">Belum ditugaskan</option>
                  {people
                    .filter(
                      (p) =>
                        p.is_active &&
                        p.department_id === current.department_id &&
                        p.role !== "tenant",
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  disabled
                  value={
                    people.find((p) => p.id === current.assigned_to)
                      ?.full_name || "Belum ditugaskan"
                  }
                />
              )}
            </label>
          </div>
          {status !== current.status && (
            <label>
              {status === "resolved"
                ? "Catatan penyelesaian *"
                : status === "rejected"
                  ? "Alasan penolakan *"
                  : "Catatan"}
              <textarea
                name="notes"
                rows={3}
                maxLength={5000}
                minLength={
                  ["resolved", "rejected"].includes(status) ? 5 : undefined
                }
                required={["resolved", "rejected"].includes(status)}
              />
            </label>
          )}
          {status === "resolved" && status !== current.status && (
            <PhotoInput required />
          )}
          <button className="primary" disabled={busy}>
            <Check size={16} />
            {busy ? "Menyimpan..." : "Simpan perubahan"}
          </button>
        </form>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <section className="history">
        <h3>
          Percakapan request <span>{logs.length}</span>
        </h3>
        {logs.length === 0 ? (
          <p className="muted">Belum ada riwayat yang dapat ditampilkan.</p>
        ) : (
          logs.map((log) => (
            <div
              className={`log ${log.action === "COMMENT_ADDED" ? "chat-message" : ""} ${log.actor_id === profile.id ? "own-message" : ""}`}
              key={log.id}
            >
              <span className="log-dot" />
              <div>
                <strong>
                  {people.find((p) => p.id === log.actor_id)?.full_name ||
                    "Pengguna Mall"}
                </strong>
                <p>
                  {log.action === "STATUS_CHANGED"
                    ? log.notes.replace(
                        /\b(pending|in_progress|resolved|closed|rejected)\b/g,
                        (value) => statuses[value],
                      )
                    : log.notes}
                </p>
                <small>{fmt(log.created_at)} WIB</small>
              </div>
            </div>
          ))
        )}
        <form onSubmit={addComment}>
          <label>
            Tulis pesan
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              required
              rows={2}
              placeholder="Tulis pembaruan untuk tim..."
            />
          </label>
          <button className="secondary" disabled={busy || !comment.trim()}>
            <MessageSquare size={16} />
            Kirim pesan
          </button>
        </form>
      </section>
    </Modal>
  );
}
export default function Portal({ profile, initialSection = "tickets" }) {
  const [tickets, setTickets] = useState([]),
    [departments, setDepartments] = useState([]),
    [people, setPeople] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [section, setSectionValue] = useState(
      initialSection === "overview" && canDashboard(profile.role)
        ? "overview"
        : "tickets",
    ),
    [filters, setFilters] = useState({}),
    [newTicket, setNewTicket] = useState(false),
    [selected, setSelected] = useState(null),
    [connected, setConnected] = useState(false),
    [mobile, setMobile] = useState(false),
    [revision, setRevision] = useState(0),
    [modDirty, setModDirty] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const generation = useRef(0);
  function setSection(next) {
    if (next === "overview" && !canDashboard(profile.role)) return;
    if (
      section === "mod" &&
      next !== "mod" &&
      modDirty &&
      !window.confirm("Draft checklist belum disimpan. Tinggalkan perubahan?")
    )
      return;
    setSectionValue(next);
    setMobile(false);
  }
  const load = useCallback(async () => {
    const seq = ++generation.current;
    try {
      const sb = createClient(),
        all = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await sb
          .from("requests")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, start + 499);
        if (error) throw error;
        all.push(...data);
        if (data.length < 500) break;
      }
      const results = await Promise.all([
        sb.from("departments").select("*").order("name"),
        sb.rpc("member_directory"),
      ]);
      for (const r of results) if (r.error) throw r.error;
      if (seq === generation.current) {
        setTickets(all);
        setDepartments(results[0].data);
        setPeople(results[1].data);
        setError("");
        setRevision((r) => r + 1);
      }
    } catch {
      if (seq === generation.current)
        setError("Data gagal dimuat. Periksa koneksi dan coba muat ulang.");
    } finally {
      if (seq === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const sb = createClient();
    let timer;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    const channel = sb
      .channel(`mall:operations:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "mall", table: "requests" },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "mall", table: "request_logs" },
        reload,
      )
      .subscribe((state) => {
        setConnected(state === "SUBSCRIBED");
        if (state === "SUBSCRIBED") reload();
      });
    const poll = setInterval(load, 60000),
      auth = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") window.location.assign("/login");
      });
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      generation.current++;
      sb.removeChannel(channel);
      auth.data.subscription.unsubscribe();
    };
  }, [load, profile.id]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const done = (message) => {
    setNotice(message);
    load();
  };
  async function signOut() {
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) setError("Keluar gagal. Silakan coba lagi.");
    else window.location.assign("/login");
  }
  const items = [
    ["tickets", Ticket, "Request"],
    ...(canDashboard(profile.role)
      ? [["overview", LayoutDashboard, "Dashboard"]]
      : []),
    ...(profile.role !== "tenant" ? [["mod", CheckCheck, "Checklist"]] : []),
    ...(isAdministrator(profile.role)
      ? [["members", ShieldCheck, "Pengguna"]]
      : []),
    ["account", UserRound, "Akun"],
  ];
  const title = items.find((i) => i[0] === section)?.[2];
  const description = {
    tickets: "Request masuk dan keluar, percakapan, serta tindak lanjut tim.",
    overview: "Pantau kebutuhan operasional dan progres penanganan departemen.",
    mod: "Pemeriksaan area dan penanggung jawab Manager On Duty.",
    members: "Periksa usulan pendaftar, lalu setujui atau koreksi aksesnya.",
    account: "Kelola keamanan akun P-Ex Connect Anda.",
  }[section];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Langsung ke konten
      </a>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="/request">
          <span className="brand-icon">
            <ArrowUpRight />
          </span>
          <span>
            P-Ex <b>Connect</b>
            <small>PEKANBARU XCHANGE</small>
          </span>
        </a>
        <nav>
          {items.map(([key, Icon, label]) => (
            <button
              key={key}
              className={section === key ? "active" : ""}
              aria-current={section === key ? "page" : undefined}
              onClick={() => setSection(key)}
            >
              <Icon size={21} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-card">
            <span className="avatar">
              {profile.full_name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{profile.full_name}</strong>
              <small>
                {roles[profile.role]} ·{" "}
                {departments.find((d) => d.id === profile.department_id)
                  ?.code || "Mall"}
              </small>
            </div>
            <button aria-label="Keluar akun" onClick={signOut}>
              <LogOut size={19} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Tutup navigasi"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Buka navigasi"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>P-Ex Connect</span>
            <ChevronRight size={16} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className={`live ${connected ? "online" : ""}`}>
              <i />
              {connected ? "Terhubung" : "Sinkronisasi berkala"}
            </span>
          </div>
        </header>
        <main className="dashboard" id="main-content">
          <div className="page-heading">
            <div>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <button className="primary" onClick={() => setNewTicket(true)}>
              <Plus size={20} />
              Buat request
            </button>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={load}>Coba lagi</button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <CheckCheck size={20} />
              {notice}
              <button
                aria-label="Tutup notifikasi"
                onClick={() => setNotice("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              <h3>Memuat ruang kerja...</h3>
            </div>
          ) : (
            <>
              {section === "tickets" && (
                <RequestTracker
                  tickets={tickets}
                  departments={departments}
                  people={people}
                  profile={profile}
                  filters={filters}
                  setFilters={setFilters}
                  onOpen={setSelected}
                  onRefresh={load}
                />
              )}
              {section === "overview" && canDashboard(profile.role) && (
                <OperationsDashboard
                  tickets={tickets}
                  departments={departments}
                  profile={profile}
                  onDrill={(next) => {
                    setFilters(next);
                    setSection("tickets");
                  }}
                  onOpen={setSelected}
                />
              )}
              {section === "mod" && profile.role !== "tenant" && (
                <ModPanel
                  profile={profile}
                  departments={departments}
                  onDirty={setModDirty}
                  onRequest={setNewTicket}
                  reportTarget={reportTarget}
                />
              )}
              {section === "members" && isAdministrator(profile.role) && (
                <Members profile={profile} departments={departments} />
              )}{" "}
              {section === "account" && <Account profile={profile} />}
            </>
          )}
          <footer className="dashboard-footer">
            <span>
              P-Ex Connect <i /> Pekanbaru XChange
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navigasi utama">
        {[
          ["tickets", Ticket, "Request"],
          ["new", Plus, "Buat"],
          ...(canDashboard(profile.role)
            ? [["overview", LayoutDashboard, "Dashboard"]]
            : []),
          profile.role !== "tenant"
            ? ["mod", CheckCheck, "Checklist"]
            : ["account", UserRound, "Akun"],
          ...(!canDashboard(profile.role) && profile.role !== "tenant"
            ? [["account", UserRound, "Akun"]]
            : []),
        ].map(([key, Icon, label]) => (
          <button
            key={key}
            className={section === key ? "active" : ""}
            aria-current={section === key ? "page" : undefined}
            onClick={() =>
              key === "new" ? setNewTicket(true) : setSection(key)
            }
          >
            <Icon size={23} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {!mobile && !newTicket && !selected && profile.role !== "tenant" && (
        <DutyCard
          onOpen={(report) => {
            setReportTarget({ id: report.id, nonce: Date.now() });
            setSection("mod");
          }}
        />
      )}
      {newTicket && (
        <NewTicket
          departments={departments}
          initial={typeof newTicket === "object" ? newTicket : {}}
          close={() => setNewTicket(false)}
          done={done}
        />
      )}
      {selected && (
        <Detail
          ticket={selected}
          profile={profile}
          people={people}
          departments={departments}
          close={() => setSelected(null)}
          done={done}
          revision={revision}
        />
      )}
    </div>
  );
}
