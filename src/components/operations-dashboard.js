"use client";
import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Clock3,
  CheckCheck,
  Ticket,
  Activity,
} from "lucide-react";
import { filterRequests, groupRequests } from "@/lib/request-filters.mjs";
import { jakartaDay, statuses, locations } from "@/lib/domain.mjs";
import { hasGlobalRequests } from "@/lib/registration.mjs";

function Bars({ title, subtitle, rows, label, onSelect, tone = "" }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className={`observation-card ${tone}`}>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <div className="chart-bars">
        {rows.length ? (
          rows.map(([key, count]) => (
            <button
              className="chart-row"
              key={key}
              onClick={() => onSelect(key)}
              aria-label={`${label(key)}: ${count} request. Lihat riwayat`}
            >
              <span className="chart-label">{label(key)}</span>
              <span className="chart-track">
                <span style={{ width: `${(count / max) * 100}%` }} />
              </span>
              <strong>{count}</strong>
              <ArrowRight size={16} />
            </button>
          ))
        ) : (
          <p className="empty-chart">Belum ada request dalam periode ini.</p>
        )}
      </div>
    </section>
  );
}
export default function OperationsDashboard({
  tickets,
  departments,
  profile,
  onDrill,
  onOpen,
}) {
  const [filters, setFilters] = useState(() => ({
    from: jakartaDay(Date.now() - 29 * 86400000),
    to: jakartaDay(),
  }));
  const change = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const rows = filterRequests(tickets, filters);
  const drill = (extra) => onDrill({ ...filters, ...extra });
  const name = (id) =>
    departments.find((d) => d.id === id)?.name || "Tanpa departemen / Tenant";
  const active = filterRequests(rows, { status: "active" });
  const urgent = filterRequests(active, { priority: "urgent" });
  const oldest = [...active]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 5);
  const days = groupRequests(rows, "day").sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const statCards = [
    ["Total request", rows.length, {}, Ticket],
    [
      "Open",
      filterRequests(rows, { status: "pending" }).length,
      { status: "pending" },
      Clock3,
    ],
    [
      "In Progress",
      filterRequests(rows, { status: "in_progress" }).length,
      { status: "in_progress" },
      Activity,
    ],
    [
      "Selesai",
      filterRequests(rows, { status: "completed" }).length,
      { status: "completed" },
      CheckCheck,
    ],
  ];
  return (
    <div className="operations-dashboard">
      <div className="scope-note">
        <BarChart3 size={20} />
        <span>
          {hasGlobalRequests(profile.role)
            ? "Monitoring seluruh departemen"
            : "Monitoring request masuk dan keluar departemen Anda"}
          . Klik angka atau grafik untuk membuka riwayat request.
        </span>
      </div>
      <div className="observation-filters">
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
          Departemen tujuan
          <select
            value={filters.department || ""}
            onChange={(e) => change("department", e.target.value)}
          >
            <option value="">Semua tujuan</option>
            {departments
              .filter(
                (d) =>
                  d.is_active || tickets.some((t) => t.department_id === d.id),
              )
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
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
        <button className="secondary" onClick={() => setFilters({})}>
          Semua periode
        </button>
      </div>
      <div className="stats-grid">
        {statCards.map(([label, count, extra, Icon], i) => (
          <button
            className={`observation-stat stat-card tone-${i}`}
            key={label}
            onClick={() => drill(extra)}
          >
            <span>
              <Icon size={22} />
              {label}
            </span>
            <strong>{count}</strong>
            <small>
              Lihat request <ArrowRight size={15} />
            </small>
          </button>
        ))}
      </div>
      <div className="observation-grid">
        <Bars
          title="Request per departemen tujuan"
          subtitle="Beban request yang diterima setiap departemen."
          rows={groupRequests(rows, "department_id")}
          label={name}
          onSelect={(department) => drill({ department })}
        />
        <Bars
          title="Request per departemen pengirim"
          subtitle="Asal kebutuhan operasional yang dilaporkan."
          tone="teal-chart"
          rows={groupRequests(rows, "reported_department_id")}
          label={name}
          onSelect={(sender) => drill({ sender })}
        />
        <Bars
          title="Objek pengamatan"
          subtitle="Kategori kendala dan kebutuhan yang paling sering muncul."
          rows={groupRequests(rows, "category").slice(0, 8)}
          label={(x) => x}
          onSelect={(category) => drill({ category })}
        />
        <section className="observation-card">
          <h2>Progres penanganan</h2>
          <p>Status terkini untuk request pada periode terpilih.</p>
          <div className="status-observations">
            {Object.entries(statuses).map(([key, label]) => (
              <button key={key} onClick={() => drill({ status: key })}>
                <span className={`badge ${key}`}>
                  <i />
                  {label}
                </span>
                <strong>{rows.filter((t) => t.status === key).length}</strong>
                <ArrowRight size={18} />
              </button>
            ))}
            <button onClick={() => drill({ status: "today" })}>
              <span>Selesai hari ini</span>
              <strong>
                {filterRequests(rows, { status: "today" }).length}
              </strong>
              <ArrowRight size={18} />
            </button>
          </div>
          <button
            className="urgent-observation"
            onClick={() => drill({ status: "active", priority: "urgent" })}
          >
            <span>Prioritas tinggi / darurat belum selesai</span>
            <strong>{urgent.length}</strong>
            <ArrowRight size={18} />
          </button>
        </section>
      </div>
      <section className="observation-card trend-card">
        <h2>Tren request harian</h2>
        <p>
          Jumlah request berdasarkan tanggal dibuat (WIB). Klik batang untuk
          melihat request pada hari tersebut.
        </p>
        {days.length ? (
          <div className="daily-chart">
            {days.map(([day, count]) => (
              <button
                key={day}
                onClick={() => drill({ from: day, to: day })}
                aria-label={`${day}: ${count} request`}
              >
                <strong>{count}</strong>
                <span className="daily-track">
                  <span
                    style={{
                      height: `${(count / Math.max(...days.map((r) => r[1]))) * 100}%`,
                    }}
                  />
                </span>
                <small>
                  {day.slice(8)}/{day.slice(5, 7)}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-chart">Belum ada request dalam periode ini.</p>
        )}
      </section>
      <section className="observation-card">
        <h2>Request aktif paling lama</h2>
        <p>
          Prioritaskan tindak lanjut. Pilih request untuk membuka percakapan dan
          riwayat penanganannya.
        </p>
        <div className="attention-list">
          {oldest.map((t) => (
            <button key={t.id} onClick={() => onOpen(t)}>
              <span>
                <small>
                  {t.ticket_number} · {jakartaDay(t.created_at)}
                </small>
                <strong>{t.title}</strong>
                <small>
                  {name(t.reported_department_id)} → {name(t.department_id)}
                </small>
              </span>
              <span className={`badge ${t.status}`}>{statuses[t.status]}</span>
              <ArrowRight size={20} />
            </button>
          ))}
          {!oldest.length && (
            <p className="empty-chart">
              Tidak ada request aktif pada periode terpilih.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
