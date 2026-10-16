"use client";
import { useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  ArrowRight,
  MapPin,
  LayoutGrid,
  List,
  MessageSquare,
} from "lucide-react";
import { filterRequests } from "@/lib/request-filters.mjs";
import { statuses, priorities, locations, jakartaDay } from "@/lib/domain.mjs";
export default function RequestTracker({
  tickets,
  departments,
  people,
  profile,
  filters,
  setFilters,
  onOpen,
  onRefresh,
}) {
  const [page, setPage] = useState(1),
    [view, setView] = useState("table");
  const [advanced, setAdvanced] = useState(
    Boolean(
      filters.floor ||
        filters.from ||
        filters.to ||
        filters.category ||
        filters.priority,
    ),
  );
  const change = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  useEffect(() => setPage(1), [filters]);
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 640px)");
    const adjust = () => {
      if (screen.matches) setView("table");
    };
    adjust();
    screen.addEventListener("change", adjust);
    return () => screen.removeEventListener("change", adjust);
  }, []);
  const rows = filterRequests(tickets, filters, profile.department_id);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  const name = (id) =>
    departments.find((d) => d.id === id)?.name || "Tanpa departemen / Tenant";
  const departmentChoices = departments.filter(
    (d) =>
      d.is_active ||
      tickets.some(
        (t) => t.department_id === d.id || t.reported_department_id === d.id,
      ),
  );
  const statusBadge = (t) => (
    <span className={`badge ${t.status}`}>
      <i />
      {statuses[t.status]}
    </span>
  );
  const route = (t) => (
    <span className="request-route">
      <span>
        <small>Pengirim</small>
        {name(t.reported_department_id)}
      </span>
      <ArrowRight size={17} />
      <span>
        <small>Tujuan</small>
        {name(t.department_id)}
      </span>
    </span>
  );
  const card = (t) => (
    <button className="request-card" key={t.id} onClick={() => onOpen(t)}>
      <span className="request-card-top">
        <small>{t.ticket_number}</small>
        {statusBadge(t)}
      </span>
      <strong>{t.title}</strong>
      <span className="muted">
        <MapPin size={16} />
        {t.location}
      </span>
      {route(t)}
      <span className="request-card-bottom">
        <span className={`badge ${t.priority}`}>{priorities[t.priority]}</span>
        <small>{jakartaDay(t.created_at)} · Buka percakapan</small>
      </span>
    </button>
  );
  return (
    <section className="tracker">
      <div className="tracker-heading">
        <div>
          <h2>
            Daftar request <span>{rows.length}</span>
          </h2>
          <p>Pilih request untuk melihat percakapan dan tindak lanjut.</p>
        </div>
        <div className="view-toggle">
          <button
            className={view === "table" ? "selected" : ""}
            onClick={() => setView("table")}
          >
            <List size={18} />
            Daftar
          </button>
          <button
            className={view === "kanban" ? "selected" : ""}
            onClick={() => setView("kanban")}
          >
            <LayoutGrid size={18} />
            Papan
          </button>
        </div>
      </div>
      {profile.department_id && (
        <div className="status-tabs" aria-label="Arah request">
          {[
            ["", "Semua yang dapat diakses"],
            ["incoming", "Masuk ke departemen saya"],
            ["outgoing", "Dikirim departemen saya"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={(filters.relation || "") === key ? "selected" : ""}
              aria-pressed={(filters.relation || "") === key}
              onClick={() => change("relation", key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="request-filter-grid">
        <label className="filter-search">
          Cari request
          <div className="search-input">
            <Search size={18} />
            <input
              placeholder="Nomor, judul, lokasi..."
              value={filters.search || ""}
              onChange={(e) => change("search", e.target.value)}
            />
          </div>
        </label>
        {[
          ["sender", "Departemen pengirim"],
          ["department", "Departemen tujuan"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <select
              value={filters[key] || ""}
              onChange={(e) => change(key, e.target.value)}
            >
              <option value="">Semua</option>
              {key === "sender" && (
                <option value="unassigned">Tanpa departemen / Tenant</option>
              )}
              {departmentChoices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <details
        className="advanced-filters"
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary>
          Filter lainnya
          {[
            filters.floor,
            filters.from,
            filters.to,
            filters.category,
            filters.priority,
          ].filter(Boolean).length
            ? " · Ada filter aktif"
            : ""}
        </summary>
        <div className="request-filter-grid">
          <label>
            Lantai
            <select
              value={filters.floor || ""}
              onChange={(e) => change("floor", e.target.value)}
            >
              <option value="">Semua lantai</option>
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Dibuat mulai
            <input
              type="date"
              value={filters.from || ""}
              max={filters.to || undefined}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            Sampai tanggal
            <input
              type="date"
              value={filters.to || ""}
              min={filters.from || undefined}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
          <label>
            Kategori
            <select
              value={filters.category || ""}
              onChange={(e) => change("category", e.target.value)}
            >
              <option value="">Semua kategori</option>
              {[...new Set(tickets.map((t) => t.category))].sort().map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Prioritas
            <select
              value={filters.priority || ""}
              onChange={(e) => change("priority", e.target.value)}
            >
              <option value="">Semua prioritas</option>
              <option value="urgent">Tinggi / Darurat</option>
              {Object.entries(priorities).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button
              className="secondary"
              onClick={() => {
                setFilters({});
                setAdvanced(false);
              }}
            >
              Reset filter
            </button>
            <button
              className="icon-button"
              aria-label="Muat ulang request"
              onClick={onRefresh}
            >
              <RefreshCw size={19} />
            </button>
          </div>
        </div>
      </details>
      <div className="status-tabs" aria-label="Status request">
        {[
          ["", "Semua"],
          ...Object.entries(statuses),
          ["completed", "Semua selesai"],
          ["active", "Belum selesai"],
          ["today", "Selesai hari ini"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={(filters.status || "") === key ? "selected" : ""}
            aria-pressed={(filters.status || "") === key}
            onClick={() => change("status", key)}
          >
            {label}
            <span>
              {
                filterRequests(
                  tickets,
                  { ...filters, status: key },
                  profile.department_id,
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {!rows.length ? (
        <div className="empty">
          <MessageSquare size={30} />
          <h3>Belum ada request yang sesuai</h3>
          <p>Ubah filter atau buat request baru.</p>
        </div>
      ) : view === "kanban" ? (
        <div className="request-board">
          {Object.entries(statuses).map(([key, label]) => (
            <section key={key}>
              <h3>
                {label}{" "}
                <small>{rows.filter((t) => t.status === key).length}</small>
              </h3>
              {rows.filter((t) => t.status === key).map(card)}
              {!rows.some((t) => t.status === key) && (
                <p className="muted">Tidak ada request.</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="request-desktop table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Pengirim</th>
                  <th>Tujuan</th>
                  <th>Status / prioritas</th>
                  <th>Petugas</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice((currentPage - 1) * 12, currentPage * 12)
                  .map((t) => (
                    <tr key={t.id}>
                      <td>
                        <button
                          className="request-title-button"
                          onClick={() => onOpen(t)}
                        >
                          <small>
                            {t.ticket_number} · {jakartaDay(t.created_at)}
                          </small>
                          <strong>{t.title}</strong>
                          <small>{t.location}</small>
                        </button>
                      </td>
                      <td>{name(t.reported_department_id)}</td>
                      <td>{name(t.department_id)}</td>
                      <td>
                        {statusBadge(t)}
                        <small className="table-priority">
                          {priorities[t.priority]}
                        </small>
                      </td>
                      <td>
                        {people.find((p) => p.id === t.assigned_to)
                          ?.full_name || "Belum ditugaskan"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="request-mobile">
            {rows.slice((currentPage - 1) * 12, currentPage * 12).map(card)}
          </div>
          <div className="request-pagination">
            <span>
              {(currentPage - 1) * 12 + 1}–
              {Math.min(currentPage * 12, rows.length)} dari {rows.length}{" "}
              request
            </span>
            <button
              className="secondary"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={currentPage * 12 >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Berikutnya
            </button>
          </div>
        </>
      )}
    </section>
  );
}
