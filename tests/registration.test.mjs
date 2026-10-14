import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("registration, admin verification, department override, rejection/resubmission, member management and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text);`);
    const base = await readFile(
      new URL("../mall_schema_init.sql", import.meta.url),
      "utf8",
    );
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20261014014212_mall_registration_approval.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.doesNotMatch(migration, /\bpublic\s*\./i);
    await db.exec(base);
    await db.exec(migration);
    const ids = Array.from(
      { length: 5 },
      (_, i) => `10000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
    );
    for (let i = 0; i < ids.length; i++)
      await db.query("INSERT INTO auth.users VALUES($1,$2,$3)", [
        ids[i],
        `member${i}@example.invalid`,
        i === 4 ? null : new Date().toISOString(),
      ]);
    const { rows: depts } = await db.query(
      "SELECT id,code FROM mall.departments WHERE code IN ('ENG','HK') ORDER BY code",
    );
    const eng = depts[0].id,
      hk = depts[1].id;
    await db.query(
      "INSERT INTO mall.profiles(id,full_name,email,role,department_id) VALUES($1,'Admin Mall','admin@example.invalid','admin',$2)",
      [ids[0], eng],
    );
    const asUser = async (i) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        ids[i],
      ]);
      await db.exec("SET ROLE authenticated");
    };
    const submit = () =>
      db.query(
        "SELECT mall.submit_registration('Calon Staf','08123456789','Teknisi','ENG','staff',NULL,NULL)",
      );
    const state = async () =>
      (await db.query("SELECT mall.access_state() AS state")).rows[0].state;
    await asUser(4);
    await assert.rejects(submit, /Verifikasi email/);
    await asUser(1);
    assert.equal((await state()).status, "unregistered");
    await submit();
    await submit();
    assert.equal((await state()).status, "pending");
    assert.equal(
      (await db.query("SELECT * FROM mall.profiles")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("SELECT * FROM mall.requests")).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query(
          "SELECT mall.create_request('New ticket','No access before approval','AC','Lantai 1','low',$1,NULL)",
          [eng],
        ),
      /aktif/,
    );
    await assert.rejects(
      () => db.query("UPDATE mall.registration_requests SET status='approved'"),
      /permission denied/,
    );
    const app = (await db.query("SELECT * FROM mall.registration_requests"))
      .rows[0];
    const review = (
      decision = "approved",
      dept = hk,
      expected = app.updated_at,
      notes = null,
    ) =>
      db.query(
        "SELECT mall.review_registration($1,$2,$3,'staff',$4,'Housekeeping Attendant',$5)",
        [ids[1], expected, decision, dept, notes],
      );
    await assert.rejects(review, /Hanya admin/);
    await asUser(2);
    assert.equal(
      (await db.query("SELECT * FROM mall.registration_requests")).rows.length,
      0,
    );
    await submit();
    await asUser(0);
    assert.equal(
      (await db.query("SELECT * FROM mall.registration_requests")).rows.length,
      2,
    );
    await assert.rejects(() => review("approved", null), /departemen final/);
    await assert.rejects(
      () => review("approved", hk, "2000-01-01T00:00:00Z"),
      /Data berubah/,
    );
    await review();
    await assert.rejects(review, /tidak lagi/);
    let member = (
      await db.query("SELECT * FROM mall.profiles WHERE id=$1", [ids[1]])
    ).rows[0];
    assert.equal(member.department_id, hk);
    assert.equal(member.job_title, "Housekeeping Attendant");
    assert.equal(member.role, "staff");
    const requestAfter = (
      await db.query(
        "SELECT * FROM mall.registration_requests WHERE user_id=$1",
        [ids[1]],
      )
    ).rows[0];
    assert.equal(requestAfter.requested_department_id, eng);
    const update = (target, version, role = "supervisor", active = true) =>
      db.query("SELECT mall.update_member($1,$2,$3,$4,$5,$6)", [
        target,
        version,
        role,
        eng,
        "Engineering Supervisor",
        active,
      ]);
    await asUser(1);
    assert.equal((await state()).status, "active");
    await assert.rejects(
      () => update(ids[1], member.updated_at, "admin"),
      /Hanya admin/,
    );
    await assert.rejects(submit, /sudah tercatat/);
    await asUser(0);
    await update(ids[1], member.updated_at);
    await assert.rejects(
      () => update(ids[1], member.updated_at),
      /Data pengguna berubah/,
    );
    member = (
      await db.query("SELECT * FROM mall.profiles WHERE id=$1", [ids[1]])
    ).rows[0];
    assert.equal(member.department_id, eng);
    assert.equal(member.role, "supervisor");
    await update(ids[1], member.updated_at, "supervisor", false);
    await asUser(1);
    assert.equal((await state()).status, "inactive");
    await assert.rejects(submit, /sudah tercatat/);
    assert.equal(
      (await db.query("SELECT * FROM mall.requests")).rows.length,
      0,
    );
    await asUser(0);
    const self = (
      await db.query("SELECT * FROM mall.profiles WHERE id=$1", [ids[0]])
    ).rows[0];
    await assert.rejects(
      () => update(ids[0], self.updated_at, "staff"),
      /admin sendiri/,
    );
    await assert.rejects(
      () => update(ids[0], self.updated_at, "admin", false),
      /admin sendiri/,
    );
    const other = (
      await db.query(
        "SELECT * FROM mall.registration_requests WHERE user_id=$1",
        [ids[2]],
      )
    ).rows[0];
    await db.query(
      "SELECT mall.review_registration($1,$2,'rejected',NULL,NULL,NULL,'Lengkapi data departemen yang benar.')",
      [ids[2], other.updated_at],
    );
    await asUser(2);
    assert.equal((await state()).status, "rejected");
    await submit();
    assert.equal((await state()).status, "pending");
    await asUser(0);
    assert.ok(
      (await db.query("SELECT * FROM mall.member_logs")).rows.length >= 7,
    );
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(
      () => db.query("SELECT mall.access_state()"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
