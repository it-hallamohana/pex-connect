"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  LayoutDashboard,
  Ticket,
  Building2,
  LogOut,
  Search,
  Plus,
  ArrowRight,
  Clock3,
  CheckCheck,
  Activity,
  LayoutGrid,
  List,
  MapPin,
  X,
  Upload,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  MessageSquare,
  UserRound,
  Menu,
  Wrench,
  Check,
  LoaderCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { requestTitles } from "@/lib/request-titles.mjs";
import Account from "@/components/account";
import Members from "@/components/members";
import {
  statuses,
  priorities,
  locations,
  canManage,
  transitions,
  metrics,
  jakartaDay,
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
function NewTicket({ departments, close, done }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [destination, setDestination] = useState("");
  const [titleChoice, setTitleChoice] = useState("");
  const titleOptions = requestTitles(
    departments.find((d) => d.id === destination)?.code,
  );
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
        p_category: f.get("request_type"),
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
          Jenis request *
          <select name="request_type" defaultValue="Guest Request">
            <option>Guest Request</option>
            <option>Internal Request</option>
          </select>
        </label>
        <label>
          Departemen tujuan *
          <select
            name="department"
            required
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setTitleChoice("");
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
          Judul request *
          <select
            required
            disabled={!destination}
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
              placeholder="Tuliskan kebutuhan Anda"
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            Lantai / area *
            <select name="floor">
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Lokasi spesifik *
            <input
              name="location"
              placeholder="Koridor timur / Unit 12B"
              maxLength={120}
              required
            />
          </label>
        </div>
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
    admin = ["admin", "supervisor"].includes(profile.role);
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
          <Ticket size={16} />
          {current.category}
        </span>
        <span>
          <MapPin size={16} />
          {current.location}
        </span>
        <span>
          <Building2 size={16} />
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
          Riwayat aktivitas <span>{logs.length}</span>
        </h3>
        {logs.length === 0 ? (
          <p className="muted">Belum ada riwayat yang dapat ditampilkan.</p>
        ) : (
          logs.map((log) => (
            <div className="log" key={log.id}>
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
            Tambahkan komentar
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
            Kirim komentar
          </button>
        </form>
      </section>
    </Modal>
  );
}
export default function Portal({ profile }) {
  const [tickets, setTickets] = useState([]),
    [departments, setDepartments] = useState([]),
    [people, setPeople] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [section, setSection] = useState("overview"),
    [view, setView] = useState("table"),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState(""),
    [floor, setFloor] = useState(""),
    [status, setStatus] = useState(""),
    [newTicket, setNewTicket] = useState(false),
    [selected, setSelected] = useState(null),
    [connected, setConnected] = useState(false),
    [mobile, setMobile] = useState(false),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(1);
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 640px)");
    const useMobileList = () => {
      if (screen.matches) setView("table");
    };
    useMobileList();
    screen.addEventListener("change", useMobileList);
    return () => screen.removeEventListener("change", useMobileList);
  }, []);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    try {
      const sb = createClient();
      const all = [];
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
        sb
          .from("profiles")
          .select("id,full_name,role,department_id,is_active")
          .order("full_name"),
      ]);
      for (const result of results) if (result.error) throw result.error;
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
    const poll = setInterval(load, 60000);
    const auth = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.assign("/login");
    });
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
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
  useEffect(() => setPage(1), [search, department, floor, status]);
  const filtered = tickets.filter(
    (t) =>
      (!department || t.department_id === department) &&
      (!floor || t.location.startsWith(floor)) &&
      (!status ||
        (status === "today"
          ? t.resolved_at &&
            ["resolved", "closed"].includes(t.status) &&
            jakartaDay(t.resolved_at) === jakartaDay()
          : t.status === status)) &&
      `${t.title} ${t.ticket_number} ${t.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const stats = metrics(tickets);
  const done = (message) => {
    setNotice(message);
    load();
  };
  const deptName = (id) =>
    departments.find((d) => d.id === id)?.name || "Departemen";
  async function signOut() {
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) setError("Keluar gagal. Silakan coba lagi.");
    else window.location.assign("/login");
  }
  const items = [
    ["overview", LayoutDashboard, "Dashboard"],
    ["tickets", Ticket, "Request"],
    ["departments", Building2, "Departemen"],
    ...(profile.role === "admin" ? [["members", ShieldCheck, "Pengguna"]] : []),
    ["account", UserRound, "Akun"],
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Langsung ke konten
      </a>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="/dashboard">
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
              onClick={() => {
                setSection(key);
                setMobile(false);
              }}
            >
              <Icon size={19} />
              {label}
              {key === "tickets" && <span>{tickets.length}</span>}
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
                {profile.role} ·{" "}
                {departments.find((d) => d.id === profile.department_id)
                  ?.code || "Mall"}
              </small>
            </div>
            <button aria-label="Keluar akun" onClick={signOut}>
              <LogOut size={17} />
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
            <ChevronRight size={14} />
            <strong>{items.find((i) => i[0] === section)?.[2]}</strong>
          </div>
          <div className="topbar-right">
            <span className={`live ${connected ? "online" : ""}`}>
              <i />
              {connected ? "Terhubung" : "Sinkronisasi berkala"}
            </span>
            <span className="topbar-date">
              {new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Jakarta",
              }).format(new Date())}
            </span>
          </div>
        </header>
        <main className="dashboard" id="main-content">
          <div className="page-heading">
            <div>
              <h1>{items.find((i) => i[0] === section)?.[2]}</h1>
              <p>
                {section === "overview"
                  ? `Selamat bekerja, ${profile.full_name.split(" ")[0]}. Pantau dan koordinasikan kebutuhan mall hari ini.`
                  : section === "tickets"
                    ? "Kelola laporan dan permintaan dalam satu ruang kerja."
                    : section === "members"
                      ? "Setujui pendaftaran dan tetapkan jabatan serta departemen final setiap pengguna."
                      : section === "account"
                        ? "Kelola keamanan akun P-Ex Connect Anda."
                        : "Pantau distribusi pekerjaan di setiap departemen."}
              </p>
            </div>
            <button className="primary" onClick={() => setNewTicket(true)}>
              <Plus size={18} />
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
              <CheckCheck size={19} />
              {notice}
              <button
                aria-label="Tutup notifikasi"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {["overview", "tickets"].includes(section) && (
            <section className="stats-grid">
              {[
                ["Total request", "Dalam akses Anda", Ticket, "magenta"],
                ["Open", "Belum ditangani", Clock3, "orange"],
                ["In Progress", "Sedang ditangani", Wrench, "blue"],
                [
                  "Selesai hari ini",
                  "Terselesaikan hari ini · WIB",
                  CheckCheck,
                  "teal",
                ],
              ].map(([label, caption, Icon, color], index) => (
                <button
                  className={`stat-card ${color}`}
                  key={label}
                  onClick={() => {
                    setSection("tickets");
                    setStatus(["", "pending", "in_progress", "today"][index]);
                    setDepartment("");
                    setFloor("");
                    setSearch("");
                  }}
                >
                  <div>
                    <span>{label}</span>
                    <span className="stat-icon">
                      <Icon size={19} />
                    </span>
                  </div>
                  <strong>
                    {loading ? "—" : stats[index].toLocaleString("id-ID")}
                  </strong>
                  <small>{caption}</small>
                </button>
              ))}
            </section>
          )}
          {section === "overview" && (
            <section className="overview-strip">
              <div>
                <span className="strip-icon">
                  <Activity size={23} />
                </span>
                <div>
                  <h3>Perlu perhatian</h3>
                  <p>
                    {
                      tickets.filter(
                        (t) =>
                          ["pending", "in_progress"].includes(t.status) &&
                          ["high", "emergency"].includes(t.priority),
                      ).length
                    }{" "}
                    tiket prioritas tinggi atau darurat masih memerlukan
                    perhatian.
                  </p>
                </div>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setSection("tickets");
                  setStatus("");
                }}
              >
                Lihat request
                <ArrowRight size={16} />
              </button>
            </section>
          )}
          {section === "members" && profile.role === "admin" ? (
            <Members profile={profile} departments={departments} />
          ) : section === "account" ? (
            <Account profile={profile} />
          ) : section === "departments" ? (
            <section className="department-grid">
              {departments
                .filter((d) => d.is_active)
                .map((d) => {
                  const list = tickets.filter((t) => t.department_id === d.id),
                    open = list.filter((t) =>
                      ["pending", "in_progress"].includes(t.status),
                    ).length;
                  return (
                    <button
                      className="department-card"
                      key={d.id}
                      onClick={() => {
                        setDepartment(d.id);
                        setSection("tickets");
                      }}
                    >
                      <span className="department-code">{d.code}</span>
                      <h3>{d.name}</h3>
                      <p>{d.is_active ? "Departemen aktif" : "Tidak aktif"}</p>
                      <div>
                        <strong>{open}</strong>
                        <span>tiket terbuka</span>
                        <ArrowUpRight size={20} />
                      </div>
                    </button>
                  );
                })}
            </section>
          ) : (
            <>
              <section className="tracker">
                <div className="tracker-heading">
                  <div>
                    <h2>
                      {section === "overview"
                        ? "Monitor tiket"
                        : "Daftar tiket"}
                      <span>{filtered.length}</span>
                    </h2>
                    <p>Laporan terkini dan progres penanganan tim.</p>
                  </div>
                  <div className="view-toggle">
                    <button
                      className={view === "table" ? "selected" : ""}
                      aria-label="Tampilan tabel"
                      onClick={() => setView("table")}
                    >
                      <List size={16} />
                      Tabel
                    </button>
                    <button
                      className={view === "kanban" ? "selected" : ""}
                      aria-label="Tampilan kanban"
                      onClick={() => setView("kanban")}
                    >
                      <LayoutGrid size={16} />
                      Papan
                    </button>
                  </div>
                </div>
                <div className="status-tabs" aria-label="Status request">
                  {[["", "Semua"], ...Object.entries(statuses)].map(
                    ([key, label]) => (
                      <button
                        key={key}
                        className={status === key ? "selected" : ""}
                        aria-pressed={status === key}
                        onClick={() => setStatus(key)}
                      >
                        {label}
                        <span>
                          {
                            tickets.filter(
                              (t) =>
                                (!department ||
                                  t.department_id === department) &&
                                (!floor || t.location.startsWith(floor)) &&
                                (!key || t.status === key) &&
                                `${t.title} ${t.ticket_number} ${t.location}`
                                  .toLowerCase()
                                  .includes(search.toLowerCase()),
                            ).length
                          }
                        </span>
                      </button>
                    ),
                  )}
                </div>
                <div className="filters">
                  <div className="search-input">
                    <Search size={17} />
                    <input
                      aria-label="Cari tiket"
                      placeholder="Cari nomor, judul, atau lokasi..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter departemen"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="">Semua departemen</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter lantai"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                  >
                    <option value="">Semua area</option>
                    {locations.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Semua status</option>
                    <option value="today">Selesai hari ini</option>
                    {Object.entries(statuses).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    aria-label="Muat ulang tiket"
                    onClick={load}
                  >
                    <RefreshCw size={17} />
                  </button>
                </div>
                {loading ? (
                  <div className="empty">
                    <LoaderCircle className="spin" />
                    <h3>Memuat ruang kerja...</h3>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty">
                    <span>
                      <Ticket size={29} />
                    </span>
                    <h3>
                      {tickets.length
                        ? "Tidak ada tiket yang cocok"
                        : "Belum ada request"}
                    </h3>
                    <p>
                      {tickets.length
                        ? "Coba ubah pencarian atau filter Anda."
                        : "Tekan Buat request untuk melaporkan kebutuhan."}
                    </p>
                    {tickets.length ? (
                      <button
                        className="secondary"
                        onClick={() => {
                          setSearch("");
                          setDepartment("");
                          setFloor("");
                          setStatus("");
                        }}
                      >
                        Reset filter
                      </button>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => setNewTicket(true)}
                      >
                        <Plus size={16} />
                        Buat request pertama
                      </button>
                    )}
                  </div>
                ) : view === "table" ? (
                  <>
                    <div className="mobile-tickets">
                      {filtered.slice((page - 1) * 12, page * 12).map((t) => (
                        <button
                          className="mobile-ticket"
                          key={t.id}
                          onClick={() => setSelected(t)}
                        >
                          <div className="mobile-ticket-head">
                            <small>{t.ticket_number}</small>
                            <Badge value={t.status} />
                          </div>
                          <h3>{t.title}</h3>
                          <p>
                            <MapPin size={17} />
                            {t.location}
                          </p>
                          <p>
                            <Building2 size={17} />
                            {deptName(t.department_id)}
                          </p>
                          <div className="mobile-ticket-foot">
                            <Badge value={t.priority} priority />
                            <span>{fmt(t.created_at)}</span>
                            <ChevronRight size={20} />
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="table-scroll desktop-tickets">
                      <table>
                        <thead>
                          <tr>
                            <th>TIKET / LAPORAN</th>
                            <th>LOKASI</th>
                            <th>DEPARTEMEN</th>
                            <th>PRIORITAS</th>
                            <th>STATUS</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered
                            .slice((page - 1) * 12, page * 12)
                            .map((t) => (
                              <tr key={t.id}>
                                <td>
                                  <button
                                    className="ticket-title"
                                    onClick={() => setSelected(t)}
                                  >
                                    <small>{t.ticket_number}</small>
                                    <strong>{t.title}</strong>
                                    <span>{fmt(t.created_at)} WIB</span>
                                  </button>
                                </td>
                                <td>
                                  <span className="location-text">
                                    <MapPin size={14} />
                                    {t.location}
                                  </span>
                                </td>
                                <td>
                                  <span className="dept-label">
                                    {deptName(t.department_id)}
                                  </span>
                                </td>
                                <td>
                                  <Badge value={t.priority} priority />
                                </td>
                                <td>
                                  <Badge value={t.status} />
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={`Buka ${t.ticket_number}`}
                                    onClick={() => setSelected(t)}
                                  >
                                    <ChevronRight size={17} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="pagination">
                      <span>
                        Menampilkan {(page - 1) * 12 + 1}–
                        {Math.min(page * 12, filtered.length)} dari{" "}
                        {filtered.length} tiket
                      </span>
                      <div>
                        <button
                          className="secondary"
                          disabled={page === 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Sebelumnya
                        </button>
                        <button
                          className="secondary"
                          disabled={page * 12 >= filtered.length}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Berikutnya
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="kanban">
                    {Object.entries(statuses).map(([s, label]) => (
                      <div className="kanban-column" key={s}>
                        <h3>
                          <span className={`status-dot ${s}`} />
                          {label}
                          <span>
                            {filtered.filter((t) => t.status === s).length}
                          </span>
                        </h3>
                        {filtered
                          .filter((t) => t.status === s)
                          .map((t) => (
                            <button
                              className="kanban-card"
                              key={t.id}
                              onClick={() => setSelected(t)}
                            >
                              <div>
                                <small>{t.ticket_number}</small>
                                <Badge value={t.priority} priority />
                              </div>
                              <h4>{t.title}</h4>
                              <p>
                                <MapPin size={13} />
                                {t.location}
                              </p>
                              <footer>
                                <span>{deptName(t.department_id)}</span>
                                <ChevronRight size={16} />
                              </footer>
                            </button>
                          ))}
                        {!filtered.some((t) => t.status === s) && (
                          <p className="kanban-empty">Belum ada tiket</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
              {section === "overview" && (
                <section className="department-summary">
                  <h2>Ringkasan departemen</h2>
                  <p>Jumlah request yang dapat Anda akses.</p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Departemen</th>
                          <th>Open</th>
                          <th>In Progress</th>
                          <th>Resolved / Closed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departments
                          .filter((d) => d.is_active)
                          .map((d) => {
                            const rows = tickets.filter(
                              (t) => t.department_id === d.id,
                            );
                            return (
                              <tr key={d.id}>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setDepartment(d.id);
                                      setStatus("");
                                      setSection("tickets");
                                    }}
                                  >
                                    {d.name}
                                  </button>
                                </td>
                                <td>
                                  {
                                    rows.filter((t) => t.status === "pending")
                                      .length
                                  }
                                </td>
                                <td>
                                  {
                                    rows.filter(
                                      (t) => t.status === "in_progress",
                                    ).length
                                  }
                                </td>
                                <td>
                                  {
                                    rows.filter((t) =>
                                      ["resolved", "closed"].includes(t.status),
                                    ).length
                                  }
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
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
          ["overview", LayoutDashboard, "Dashboard"],
          ["tickets", Ticket, "Request"],
          ["new", Plus, "Buat"],
          ["account", UserRound, "Akun"],
        ].map(([key, Icon, label]) => (
          <button
            key={key}
            aria-current={section === key ? "page" : undefined}
            className={section === key ? "active" : ""}
            onClick={() =>
              key === "new" ? setNewTicket(true) : setSection(key)
            }
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {newTicket && (
        <NewTicket
          departments={departments}
          close={() => setNewTicket(false)}
          done={done}
        />
      )}{" "}
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
