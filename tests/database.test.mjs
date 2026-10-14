import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("actual migration: isolation, RLS, permissions, workflow, audit and concurrent update protection", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`);
    const migration = await readFile(
      new URL("../mall_schema_init.sql", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(migration, /\bpublic\s*\./i);
    await db.exec(migration);
    const ids = Array.from(
      { length: 6 },
      (_, i) => `00000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const id of ids)
      await db.query("INSERT INTO auth.users VALUES($1)", [id]);
    const { rows: depts } = await db.query(
      "SELECT id,code FROM mall.departments WHERE code IN ('ENG','HK') ORDER BY code",
    );
    const eng = depts[0].id,
      hk = depts[1].id;
    for (const [i, role, dept, active] of [
      [0, "admin", null, true],
      [1, "staff", eng, true],
      [2, "tenant", null, true],
      [3, "staff", hk, true],
      [4, "staff", eng, false],
    ])
      await db.query(
        "INSERT INTO mall.profiles(id,full_name,email,role,department_id,is_active) VALUES($1,$2,$3,$4,$5,$6)",
        [ids[i], `Test ${i}`, "test@example.invalid", role, dept, active],
      );
    const asUser = async (index) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        ids[index],
      ]);
      await db.exec("SET ROLE authenticated");
    };
    await asUser(2);
    const create = async () =>
      (
        await db.query(
          "SELECT * FROM mall.create_request('AC tidak dingin','AC di koridor perlu diperiksa','Keluhan AC','Lantai 1 · Koridor','high',$1,NULL)",
          [eng],
        )
      ).rows[0];
    const ticket = await create();
    assert.match(ticket.ticket_number, /^PX-\d{8}-\d{4,}$/);
    const ticket2 = await create();
    assert.notEqual(ticket.ticket_number, ticket2.ticket_number);
    assert.equal(
      (await db.query("SELECT * FROM mall.requests")).rows.length,
      2,
    );
    await assert.rejects(
      () => db.query("UPDATE mall.requests SET title='Bypassed'"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("UPDATE mall.profiles SET role='admin'"),
      /permission denied/,
    );
    const update = (
      status,
      expected = ticket.updated_at,
      notes = null,
      photo = null,
    ) =>
      db.query("SELECT * FROM mall.update_request($1,$2,$3,NULL,$4,$5)", [
        ticket.id,
        expected,
        status,
        notes,
        photo,
      ]);
    await assert.rejects(() => update("in_progress"), /berwenang/);
    await asUser(3);
    assert.equal(
      (await db.query("SELECT * FROM mall.requests")).rows.length,
      0,
    );
    await assert.rejects(() => update("in_progress"), /berwenang/);
    await asUser(4);
    assert.equal(
      (await db.query("SELECT * FROM mall.requests")).rows.length,
      0,
    );
    await assert.rejects(create, /aktif/);
    await asUser(5);
    assert.equal(
      (await db.query("SELECT * FROM mall.profiles")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("SELECT * FROM mall.requests")).rows.length,
      0,
    );
    await assert.rejects(create, /aktif/);
    await asUser(1);
    assert.equal(
      (await db.query("SELECT * FROM mall.requests")).rows.length,
      2,
    );
    await assert.rejects(() => update("resolved"), /Transisi/);
    await assert.rejects(
      () => update("rejected", ticket.updated_at, "Ditolak karena duplikat"),
      /supervisor/,
    );
    const progress = (await update("in_progress")).rows[0];
    await assert.rejects(
      () => update("resolved", ticket.updated_at, "Perbaikan selesai"),
      /diperbarui/,
    );
    await assert.rejects(
      () => update("resolved", progress.updated_at, "Perbaikan selesai"),
      /foto/,
    );
    const photo = `${ids[1]}/00000000-0000-4000-a000-000000000099.jpg`;
    await assert.rejects(
      () =>
        update("resolved", progress.updated_at, "Perbaikan selesai.", photo),
      /Foto penyelesaian/,
    );
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO storage.objects VALUES('mall-attachments',$1)",
      [photo],
    );
    await asUser(1);
    const resolved = (
      await update(
        "resolved",
        progress.updated_at,
        "AC sudah kembali normal.",
        photo,
      )
    ).rows[0];
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolved_at);
    await assert.rejects(
      () => update("closed", resolved.updated_at),
      /supervisor/,
    );
    await asUser(0);
    const closed = (await update("closed", resolved.updated_at)).rows[0];
    assert.equal(closed.status, "closed");
    await assert.rejects(
      () => update("in_progress", closed.updated_at),
      /Transisi/,
    );
    await db.query("SELECT mall.add_comment($1,$2)", [
      ticket.id,
      "Verifikasi operasional selesai.",
    ]);
    assert.equal(
      (
        await db.query("SELECT * FROM mall.request_logs WHERE request_id=$1", [
          ticket.id,
        ])
      ).rows.length,
      5,
    );
    await assert.rejects(
      () =>
        db.query(
          "INSERT INTO mall.request_logs(request_id,action,notes) VALUES($1,'CREATED','Forged')",
          [ticket.id],
        ),
      /permission denied/,
    );
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(
      () => db.query("SELECT * FROM mall.requests"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
