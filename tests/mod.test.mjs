import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { mallCatalog } from "../src/lib/mall-catalog.mjs";
import { operationalAreas, requestTitles } from "../src/lib/request-titles.mjs";
test("authoritative Mall catalog and MOD: access, draft conflicts, complete submission and immutable history", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text);`);
    for (const file of [
      "mall_schema_init.sql",
      "supabase/migrations/20261014014212_mall_registration_approval.sql",
      "supabase/migrations/20261014034925_mall_foxi_departments.sql",
      "supabase/migrations/20261014141836_mall_source_catalog_mod.sql",
    ]) {
      const sql = await readFile(
        new URL("../" + file, import.meta.url),
        "utf8",
      );
      assert.doesNotMatch(sql, /\bpublic\s*\./i);
      await db.exec(sql);
    }
    const items = (
      await db.query(
        "SELECT id,floor,area,title FROM mall.mod_checklist_items ORDER BY sort_order",
      )
    ).rows;
    assert.deepEqual(
      items,
      mallCatalog.modItems.map(({ id, floor, area, title }) => ({
        id,
        floor,
        area,
        title,
      })),
    );
    assert.equal(items.length, 117);
    assert.deepEqual(requestTitles("GA", "Customer Service"), ["Lainnya"]);
    assert.ok(operationalAreas("GA").includes("Security"));
    assert.ok(!requestTitles("ENG", "Genset").includes("AC Not Cold"));
    assert.equal(
      (await db.query("SELECT count(*)::int as n FROM mall.leaders")).rows[0].n,
      7,
    );
    const ids = Array.from(
      { length: 5 },
      (_, i) => `20000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
    );
    const mod = (
      await db.query("SELECT id FROM mall.departments WHERE code='MOD'")
    ).rows[0].id;
    const eng = (
      await db.query("SELECT id FROM mall.departments WHERE code='ENG'")
    ).rows[0].id;
    for (let i = 0; i < ids.length; i++) {
      await db.query("INSERT INTO auth.users VALUES($1,$2,now())", [
        ids[i],
        `mod${i}@example.invalid`,
      ]);
      if (i < 4)
        await db.query(
          "INSERT INTO mall.profiles(id,full_name,email,role,department_id) VALUES($1,$2,$3,$4,$5)",
          [
            ids[i],
            `User ${i}`,
            `mod${i}@example.invalid`,
            ["admin", "staff", "staff", "supervisor"][i],
            i === 1 ? mod : eng,
          ],
        );
    }
    const as = async (i) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        ids[i],
      ]);
      await db.exec("SET ROLE authenticated");
    };
    const leader = "00000000-0000-4000-b000-000000000001";
    const round = "30000000-0000-4000-a000-000000000001";
    const save = async (answers, expected = null, submit = false, id = round) =>
      (
        await db.query(
          "SELECT * FROM mall.save_mod_round($1,$2,$3,CURRENT_DATE,$4,$5)",
          [id, expected, leader, JSON.stringify(answers), submit],
        )
      ).rows[0];
    await as(4);
    assert.equal((await db.query("SELECT * FROM mall.leaders")).rows.length, 0);
    await assert.rejects(() => save({}), /Checklist MOD/);
    await as(2);
    await assert.rejects(() => save({}), /Checklist MOD/);
    await as(1);
    const draft = await save({
      "mod-5": { status: "issue", notes: "Lantai basah" },
    });
    assert.equal(draft.status, "draft");
    await assert.rejects(() => save({}, null), /Draft berubah/);
    await assert.rejects(
      () => save({ "not-real": { status: "ok" } }, draft.updated_at),
      /Butir/,
    );
    await assert.rejects(
      () => save({ "mod-5": { status: "ok" } }, draft.updated_at, true),
      /Lengkapi/,
    );
    await assert.rejects(
      () => db.query("UPDATE mall.mod_rounds SET status='submitted'"),
      /permission denied/,
    );
    await as(3);
    assert.equal(
      (await db.query("SELECT * FROM mall.mod_rounds")).rows.length,
      0,
    );
    await assert.rejects(
      () => save({}, draft.updated_at),
      /milik pengguna lain/,
    );
    await as(0);
    assert.equal(
      (await db.query("SELECT * FROM mall.mod_rounds")).rows.length,
      1,
    );
    await assert.rejects(
      () => save({}, draft.updated_at),
      /milik pengguna lain/,
    );
    await as(1);
    const complete = Object.fromEntries(
      items.map((i) => [i.id, { status: "ok", notes: "" }]),
    );
    complete["mod-5"] = { status: "issue", notes: "" };
    await assert.rejects(
      () => save(complete, draft.updated_at, true),
      /Temuan perlu catatan/,
    );
    complete["mod-5"].notes = "Area basah, perlu pembersihan";
    const final = await save(complete, draft.updated_at, true);
    assert.equal(final.status, "submitted");
    assert.ok(final.submitted_at);
    await assert.rejects(
      () => save(complete, final.updated_at),
      /tidak dapat diubah/,
    );
    await db.exec("RESET ROLE");
    await db.query("UPDATE mall.profiles SET is_active=false WHERE id=$1", [
      ids[1],
    ]);
    await as(1);
    assert.equal(
      (await db.query("SELECT * FROM mall.mod_rounds")).rows.length,
      0,
    );
    await assert.rejects(() => save({}), /Checklist MOD/);
    await db.exec("RESET ROLE;SET ROLE anon");
    await assert.rejects(
      () => db.query("SELECT * FROM mall.leaders"),
      /permission denied/,
    );
    await assert.rejects(() => save({}), /permission denied/);
  } finally {
    await db.close();
  }
});
