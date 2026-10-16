"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Save,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { jakartaDay } from "@/lib/domain.mjs";
import { hasGlobalRequests } from "@/lib/registration.mjs";
export function DutySchedule({ profile, leaders }) {
  const [reload, setReload] = useState(0);
  const [date, setDate] = useState(jakartaDay()),
    [existing, setExisting] = useState(null),
    [leader, setLeader] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setNotice("");
    if (!date || !hasGlobalRequests(profile.role)) return;
    createClient()
      .from("duty_assignments")
      .select("*")
      .eq("duty_date", date)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setError("Jadwal gagal dimuat. Silakan muat ulang.");
          setExisting(null);
          setLeader("");
        } else {
          setExisting(data);
          setLeader(data?.leader_id || "");
          setNotes(data?.notes || "");
        }
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [date, reload, profile.role]);
  if (!hasGlobalRequests(profile.role)) return null;
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error } = await createClient().rpc("set_duty", {
        p_date: date,
        p_leader_id: leader,
        p_expected_updated_at: existing?.updated_at || null,
        p_notes: notes,
      });
      if (error) throw error;
      setExisting(data);
      setNotice("Jadwal MOD tersimpan.");
      window.dispatchEvent(new Event("mall:duty-updated"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="duty-schedule">
      <h2>
        <CalendarDays size={22} />
        Penanggung jawab MOD
      </h2>
      <p>Tetapkan siapa yang on duty pada tanggal pemeriksaan.</p>
      <form onSubmit={save}>
        <div className="form-grid">
          <label>
            Tanggal
            <input
              type="date"
              required
              value={date}
              disabled={busy}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Manager On Duty
            <select
              value={leader}
              required
              disabled={loading || busy}
              onChange={(e) => setLeader(e.target.value)}
            >
              <option value="">Pilih penanggung jawab</option>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name} · {l.job_title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Catatan jadwal (opsional)
          <input
            maxLength={500}
            disabled={loading || busy}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <div className="alert" role="alert">
            {error}
            <button
              type="button"
              onClick={() => {
                setReload((r) => r + 1);
              }}
            >
              Muat ulang jadwal
            </button>
          </div>
        )}
        {notice && (
          <div className="resolution" role="status">
            {notice}
          </div>
        )}
        <button className="secondary" disabled={loading || busy || !leader}>
          <Save size={18} />
          {busy ? "Menyimpan..." : "Simpan jadwal"}
        </button>
      </form>
    </section>
  );
}
export default function DutyCard({ onOpen }) {
  const [duty, setDuty] = useState(null),
    [minimized, setMinimized] = useState(false),
    [error, setError] = useState(false),
    [photoFailed, setPhotoFailed] = useState(false);
  const load = useCallback(async () => {
    const sb = createClient();
    const { data, error } = await sb
      .from("duty_assignments")
      .select("*")
      .eq("duty_date", jakartaDay())
      .maybeSingle();
    if (error) {
      setError(true);
      setDuty(null);
      return;
    }
    setError(false);
    if (!data) {
      setDuty(null);
      return;
    }
    const { data: leader, error: leaderError } = await sb
      .from("leaders")
      .select("*")
      .eq("id", data.leader_id)
      .maybeSingle();
    if (leaderError) {
      setError(true);
      setDuty(null);
      return;
    }
    setDuty({ ...data, leader });
  }, []);
  useEffect(() => {
    setMinimized(window.matchMedia("(max-width: 640px)").matches);
    load();
    const id = setInterval(load, 30000);
    window.addEventListener("focus", load);
    window.addEventListener("mall:duty-updated", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", load);
      window.removeEventListener("mall:duty-updated", load);
    };
  }, [load]);
  useEffect(() => setPhotoFailed(false), [duty?.leader_id]);
  return (
    <aside
      className={`duty-card ${minimized ? "minimized" : ""}`}
      aria-label="Manager On Duty hari ini"
    >
      <header>
        <span>MOD hari ini</span>
        <button
          aria-label={minimized ? "Tampilkan MOD" : "Kecilkan MOD"}
          aria-expanded={!minimized}
          onClick={() => setMinimized(!minimized)}
        >
          {minimized ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
        </button>
      </header>
      {!minimized && (
        <>
          <div className="duty-person">
            {duty?.leader && !photoFailed ? (
              <img
                src={`/api/leaders/photo?id=${duty.leader_id}`}
                alt={duty.leader.full_name}
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <UserRound size={32} />
            )}
            <div>
              <strong>
                {error
                  ? "Jadwal belum dapat dimuat"
                  : duty?.leader?.full_name || "Belum ditetapkan"}
              </strong>
              <small>{duty?.leader?.job_title || "Manager On Duty"}</small>
            </div>
          </div>
          <button className="text-button" onClick={onOpen}>
            Buka checklist MOD
          </button>
        </>
      )}
    </aside>
  );
}
