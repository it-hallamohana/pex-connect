"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ClipboardCheck,
  Plus,
  Save,
  Send,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { hasGlobalRequests } from "@/lib/registration.mjs";
import { DutySchedule } from "@/components/duty";
import { createClient } from "@/lib/supabase";
import { jakartaDay } from "@/lib/domain.mjs";
import { mallCatalog } from "@/lib/mall-catalog.mjs";
const labels = {
  ok: "Baik",
  issue: "Perlu tindak lanjut",
  na: "Tidak berlaku",
};
const zones = [...new Set(mallCatalog.modItems.map((i) => i.floor))];
export default function ModPanel({ profile, departments, onRequest, onDirty }) {
  const [leaders, setLeaders] = useState([]),
    [rounds, setRounds] = useState([]),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [current, setCurrent] = useState(null),
    [answers, setAnswers] = useState({}),
    [leader, setLeader] = useState(""),
    [date, setDate] = useState(jakartaDay()),
    [zone, setZone] = useState(zones[0]);
  const allowed = hasGlobalRequests(profile.role);
  const locked =
    current?.status === "submitted" ||
    (current?.inspector_id && current.inspector_id !== profile.id) ||
    !allowed;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sb = createClient();
      const results = await Promise.all([
        sb
          .from("leaders")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        sb
          .from("mod_rounds")
          .select("*")
          .order("inspection_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      for (const r of results) if (r.error) throw r.error;
      setLeaders(results[0].data);
      setRounds(results[1].data);
    } catch {
      setError("Data MOD gagal dimuat. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function open(round = null) {
    if (
      dirty &&
      !window.confirm("Perubahan belum disimpan. Tinggalkan draft ini?")
    )
      return;
    setCurrent(
      round || {
        id: crypto.randomUUID(),
        status: "draft",
        inspector_id: profile.id,
      },
    );
    setAnswers(round?.answers || {});
    setLeader(round?.leader_id || "");
    setDate(round?.inspection_date || jakartaDay());
    setDirty(false);
    setNotice("");
    setError("");
    setZone(zones[0]);
  }
  function change(id, patch) {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
    setDirty(true);
  }
  async function save(e) {
    e.preventDefault();
    const submit = e.nativeEvent.submitter?.value === "submit";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error } = await createClient().rpc("save_mod_round", {
        p_id: current.id,
        p_expected_updated_at: current.updated_at || null,
        p_leader_id: leader,
        p_date: date,
        p_answers: answers,
        p_submit: submit,
      });
      if (error) throw error;
      setCurrent(data);
      setDirty(false);
      setRounds((rows) =>
        [data, ...rows.filter((r) => r.id !== data.id)].slice(0, 30),
      );
      if (submit) window.dispatchEvent(new Event("mall:duty-updated"));
      setNotice(
        submit
          ? "Checklist terkirim. Hasil pemeriksaan tersimpan."
          : "Draft berhasil disimpan.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const completed = Object.values(answers).filter(
    (a) => labels[a.status],
  ).length;
  return (
    <div className="mod-panel">
      <section className="checklist-type">
        <ClipboardCheck size={26} />
        <div>
          <h2>MOD — Manager On Duty</h2>
          <p>Pemeriksaan operasional harian Mall · 117 butir.</p>
        </div>
      </section>
      <DutySchedule profile={profile} leaders={leaders} />
      <section className="leader-section">
        <h2>Leader MOD</h2>
        <p>
          Daftar leader sesuai dokumen Mall. Pilih penanggung jawab saat mengisi
          checklist.
        </p>
        <div className="leader-grid">
          {leaders.map((l) => (
            <article className="leader-card" key={l.id}>
              <img
                src={`/api/leaders/photo?id=${l.id}`}
                alt={l.full_name}
                loading="lazy"
              />
              <div>
                <h3>{l.full_name}</h3>
                <p>{l.job_title}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="tracker">
        <header className="tracker-heading">
          <div>
            <h2>
              <ClipboardCheck size={22} />
              Checklist MOD
            </h2>
            <p>
              {mallCatalog.modItems.length} butir pemeriksaan berdasarkan lantai
              dan area.
            </p>
          </div>
          <div className="mod-toolbar">
            <button
              className="secondary"
              onClick={load}
              disabled={loading || busy}
            >
              <RefreshCw size={18} />
              Muat ulang
            </button>
            {allowed && (
              <button
                className="primary"
                onClick={() => open()}
                disabled={busy}
              >
                <Plus size={18} />
                Pemeriksaan baru
              </button>
            )}
          </div>
        </header>
        {!allowed && (
          <p className="mod-hint">
            Pengisian checklist tersedia untuk Assistant Manager, Manager, dan
            Executive.
          </p>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="resolution" role="status">
            {notice}
          </div>
        )}
        {loading ? (
          <p className="mod-hint">Memuat data MOD...</p>
        ) : !current ? (
          <div className="round-list">
            {rounds.length === 0 ? (
              <p>Belum ada pemeriksaan tersimpan.</p>
            ) : (
              <>
                <p>30 pemeriksaan terbaru yang dapat Anda akses.</p>
                {rounds.map((r) => (
                  <button
                    className="round-row"
                    key={r.id}
                    onClick={() => open(r)}
                  >
                    <span>
                      <strong>{r.inspection_date}</strong>
                      <span>
                        {leaders.find((l) => l.id === r.leader_id)?.full_name ||
                          "Leader MOD"}
                      </span>
                    </span>
                    <span
                      className={`badge ${r.status === "submitted" ? "resolved" : "pending"}`}
                    >
                      {r.status === "submitted" ? "Terkirim" : "Draft"}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          <form className="mod-form" onSubmit={save}>
            <div className="mod-toolbar">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm("Tinggalkan perubahan yang belum disimpan?")
                  ) {
                    setCurrent(null);
                    setDirty(false);
                  }
                }}
              >
                Kembali ke riwayat
              </button>
              <span className="muted">
                {locked
                  ? "Hasil pemeriksaan"
                  : dirty
                    ? "Belum disimpan"
                    : "Draft tersimpan / siap diisi"}
              </span>
            </div>
            <fieldset disabled={locked || busy} className="mod-fieldset">
              <div className="form-grid">
                <label>
                  Leader MOD *
                  <select
                    required
                    value={leader}
                    onChange={(e) => {
                      setLeader(e.target.value);
                      setDirty(true);
                    }}
                  >
                    <option value="">Pilih leader</option>
                    {leaders.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tanggal pemeriksaan *
                  <input
                    required
                    type="date"
                    max={jakartaDay()}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
            </fieldset>
            <div className="mod-progress">
              <strong>
                {completed} / {mallCatalog.modItems.length} butir diisi
              </strong>
              <span>
                {
                  Object.values(answers).filter((a) => a.status === "issue")
                    .length
                }{" "}
                temuan
              </span>
              <progress max={mallCatalog.modItems.length} value={completed} />
            </div>
            <label className="zone-filter">
              Lantai / zona pemeriksaan
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            {[
              ...new Set(
                mallCatalog.modItems
                  .filter((i) => i.floor === zone)
                  .map((i) => i.area),
              ),
            ].map((area) => (
              <section className="check-area" key={area}>
                <h3>{area}</h3>
                {mallCatalog.modItems
                  .filter((i) => i.floor === zone && i.area === area)
                  .map((item) => (
                    <div className="check-item" key={item.id}>
                      <label htmlFor={item.id}>{item.title}</label>
                      <select
                        id={item.id}
                        disabled={locked || busy}
                        value={answers[item.id]?.status || ""}
                        onChange={(e) =>
                          change(item.id, { status: e.target.value })
                        }
                      >
                        <option value="" disabled>
                          Pilih hasil pemeriksaan
                        </option>
                        {Object.entries(labels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      {answers[item.id]?.status && (
                        <label>
                          Catatan{" "}
                          {answers[item.id].status === "issue"
                            ? "temuan (wajib saat kirim)"
                            : "(opsional)"}
                          <textarea
                            disabled={locked || busy}
                            rows={2}
                            maxLength={1000}
                            value={answers[item.id]?.notes || ""}
                            onChange={(e) =>
                              change(item.id, { notes: e.target.value })
                            }
                          />
                        </label>
                      )}
                      {answers[item.id]?.status === "issue" && (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() =>
                            onRequest({
                              title: item.title,
                              floor: item.floor,
                              location: item.area,
                              description: answers[item.id]?.notes || "",
                              category: "Temuan MOD",
                            })
                          }
                        >
                          <Plus size={18} />
                          Buat request tindak lanjut
                        </button>
                      )}
                    </div>
                  ))}
              </section>
            ))}
            {!locked && (
              <div className="mod-actions">
                <button className="secondary" value="draft" disabled={busy}>
                  <Save size={18} />
                  {busy ? "Menyimpan..." : "Simpan draft"}
                </button>
                <button
                  className="primary"
                  value="submit"
                  disabled={busy || completed !== mallCatalog.modItems.length}
                >
                  <Send size={18} />
                  Kirim checklist
                </button>
                <small>
                  Periksa semua zona. Gunakan Tidak berlaku bila butir tidak
                  relevan.
                </small>
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
