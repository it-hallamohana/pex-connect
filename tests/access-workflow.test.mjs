import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  canDashboard,
  hasGlobalRequests,
  suggestedRole,
  departmentOptions,
} from "../src/lib/registration.mjs";
import { canManage } from "../src/lib/domain.mjs";
import { filterRequests, groupRequests } from "../src/lib/request-filters.mjs";

test("dashboard drilldown shares exact filters, Jakarta dates and role boundaries", () => {
  const tickets = [
    {
      id: 1,
      department_id: "ga",
      reported_department_id: "eng",
      created_at: "2026-10-15T17:30:00Z",
      location: "Lantai 1 · Atrium",
      title: "Lampu rusak",
      ticket_number: "PX-1",
      category: "Listrik",
      status: "pending",
      priority: "high",
    },
    {
      id: 2,
      department_id: "eng",
      reported_department_id: "ga",
      created_at: "2026-10-16T02:00:00Z",
      location: "Ground · Pintu",
      title: "Lampu utama",
      ticket_number: "PX-2",
      category: "Listrik",
      status: "in_progress",
      priority: "medium",
    },
    {
      id: 3,
      department_id: "ga",
      reported_department_id: null,
      created_at: "2026-10-15T16:30:00Z",
      location: "Lantai 1 · Atrium",
      title: "Bersihkan lantai",
      ticket_number: "PX-3",
      category: "Kebersihan",
      status: "closed",
      priority: "low",
    },
  ];
  const period = { from: "2026-10-16", to: "2026-10-16" };
  const rows = filterRequests(tickets, period);
  assert.equal(rows.length, 2);
  for (const [field, key] of [
    ["department_id", "department"],
    ["reported_department_id", "sender"],
    ["category", "category"],
  ]) {
    for (const [value, count] of groupRequests(rows, field))
      assert.equal(
        filterRequests(tickets, { ...period, [key]: value }).length,
        count,
      );
  }
  assert.deepEqual(
    filterRequests(tickets, { relation: "outgoing" }, "eng").map((t) => t.id),
    [1],
  );
  assert.deepEqual(
    filterRequests(tickets, { relation: "incoming" }, "eng").map((t) => t.id),
    [2],
  );
  assert.deepEqual(
    filterRequests(tickets, { status: "active", priority: "urgent" }).map(
      (t) => t.id,
    ),
    [1],
  );
  assert.deepEqual(
    filterRequests(tickets, { sender: "unassigned", status: "completed" }).map(
      (t) => t.id,
    ),
    [3],
  );
  assert.equal(canDashboard("staff"), false);
  assert.equal(canDashboard("tenant"), false);
  assert.equal(canDashboard("supervisor"), true);
  assert.equal(hasGlobalRequests("supervisor"), false);
  assert.equal(hasGlobalRequests("assistant_manager"), true);
  assert.equal(suggestedRole("Asst. IT Manager"), "assistant_manager");
  assert.equal(suggestedRole("General Manager"), "executive");
  assert.equal(suggestedRole("Jabatan baru"), "staff");
  assert.equal(
    departmentOptions.some(([code]) => code === "MOD"),
    false,
  );
  assert.equal(
    canManage({ role: "manager", department_id: "ga" }, tickets[1]),
    false,
  );
  assert.equal(canManage({ role: "executive" }, tickets[1]), true);
});

test("current Mall migrations: sender/receiver RLS, approval defaults, executive authority and MOD duty isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
   CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text);`);
    const migrations = (
      await readdir(new URL("../supabase/migrations/", import.meta.url))
    )
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of [
      "mall_schema_init.sql",
      "sql/mall_attachment_validation.sql",
      ...migrations.map((f) => "supabase/migrations/" + f),
    ]) {
      const sql = await readFile(
        new URL("../" + file, import.meta.url),
        "utf8",
      );
      assert.doesNotMatch(sql, /\bpublic\s*\./i);
      await db.exec(sql);
    }
    const departments = (
      await db.query("SELECT id,code,is_active FROM mall.departments")
    ).rows;
    const dept = (code) => departments.find((d) => d.code === code).id;
    assert.equal(departments.find((d) => d.code === "MOD").is_active, false);
    const ids = Array.from(
      { length: 13 },
      (_, i) => `40000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
    );
    // admin, ENG reporter/peer/SPV, GA receiver/SPV, unrelated LEG staff,
    // LEG manager, AM, executive, inactive, non-Mall applicant, tenant.
    const specs = [
      ["admin", null],
      ["staff", "ENG"],
      ["staff", "ENG"],
      ["supervisor", "ENG"],
      ["staff", "GA"],
      ["supervisor", "GA"],
      ["staff", "LEG"],
      ["manager", "LEG"],
      ["assistant_manager", "LEG"],
      ["executive", null],
      ["staff", "ENG"],
      null,
      ["tenant", null],
    ];
    for (let i = 0; i < ids.length; i++) {
      await db.query("INSERT INTO auth.users VALUES($1,$2,now())", [
        ids[i],
        `test${i}@example.invalid`,
      ]);
      if (specs[i])
        await db.query(
          "INSERT INTO mall.profiles(id,full_name,email,role,department_id,is_active,job_title) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            ids[i],
            `Member ${i}`,
            `test${i}@example.invalid`,
            specs[i][0],
            specs[i][1] ? dept(specs[i][1]) : null,
            i !== 10,
            i === 6 ? "Executive" : "Test member",
          ],
        );
    }
    const as = async (i) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        ids[i] || "",
      ]);
      await db.exec("SET ROLE authenticated");
    };
    const create = async (target) =>
      (
        await db.query(
          "SELECT * FROM mall.create_request('Lampu perlu perbaikan','Lampu koridor tidak menyala sejak pagi','Listrik','Lantai 1 · Koridor','high',$1,NULL)",
          [dept(target)],
        )
      ).rows[0];
    const visible = async () =>
      (await db.query("SELECT id FROM mall.requests ORDER BY id")).rows.map(
        (t) => t.id,
      );
    const version = async (table, id) =>
      (
        await db.query(
          `SELECT updated_at::text AS v FROM mall.${table} WHERE id=$1`,
          [id],
        )
      ).rows[0].v;
    await as(1);
    const outgoing = await create("GA");
    assert.equal(outgoing.reported_department_id, dept("ENG"));
    await as(6);
    const unrelated = await create("LEG");
    await as(12);
    const tenant = await create("ENG");
    assert.equal(tenant.reported_department_id, null);
    await db.exec("RESET ROLE");
    await db.query("UPDATE mall.profiles SET department_id=$1 WHERE id=$2", [
      dept("ENG"),
      ids[12],
    ]);
    await as(12);
    assert.deepEqual(
      (await db.query("SELECT id FROM mall.profiles")).rows.map((p) => p.id),
      [ids[12]],
      "Tenant cannot read staff contacts even when assigned to the same department",
    );
    for (const i of [1, 2, 3, 4, 5]) {
      await as(i);
      const rows = await visible();
      assert.ok(rows.includes(outgoing.id));
      assert.ok(!rows.includes(unrelated.id));
      await db.query("SELECT mall.add_comment($1,$2)", [
        outgoing.id,
        "Koordinasi dari departemen terkait",
      ]);
    }
    await as(6);
    assert.ok(!(await visible()).includes(outgoing.id));
    assert.equal(
      (
        await db.query("SELECT * FROM mall.request_logs WHERE request_id=$1", [
          outgoing.id,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("SELECT mall.add_comment($1,$2)", [
          outgoing.id,
          "Tidak boleh",
        ]),
      /Akses ditolak/,
    );
    for (const i of [0, 7, 8, 9]) {
      await as(i);
      assert.equal((await visible()).length, 3);
    }
    await as(12);
    assert.deepEqual(await visible(), [tenant.id]);
    for (const i of [10, 11]) {
      await as(i);
      assert.equal((await visible()).length, 0);
      await assert.rejects(() => create("GA"), /aktif/);
      await assert.rejects(
        () => db.query("SELECT * FROM mall.member_directory()"),
        /Akses ditolak/,
      );
    }
    await as(1);
    await assert.rejects(
      () => db.query("UPDATE mall.profiles SET role='executive'"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("UPDATE mall.requests SET reported_department_id=$1", [
          dept("LEG"),
        ]),
      /permission denied/,
    );
    const update = async (
      status,
      assignee = null,
      notes = null,
      photo = null,
      expected = null,
    ) =>
      db.query("SELECT * FROM mall.update_request($1,$2,$3,$4,$5,$6)", [
        outgoing.id,
        expected || (await version("requests", outgoing.id)),
        status,
        assignee,
        notes,
        photo,
      ]);
    await assert.rejects(() => update("in_progress"), /berwenang/);
    await as(7);
    await assert.rejects(() => update("in_progress"), /berwenang/);
    await as(4);
    await assert.rejects(() => update("pending", ids[4]), /Penugasan/);
    await update("in_progress");
    await assert.rejects(
      () => update("resolved", null, "Sudah diperbaiki"),
      /foto/,
    );
    await as(5);
    await assert.rejects(
      () => update("in_progress", ids[1]),
      /departemen tujuan/,
    );
    await update("in_progress", ids[4]);
    const image = `${ids[4]}/50000000-0000-4000-a000-000000000001.jpg`;
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO storage.objects VALUES('hotel-attachments',$1)",
      [image],
    );
    await as(4);
    await assert.rejects(
      () => update("resolved", ids[4], "Lampu sudah normal", image),
      /Foto penyelesaian/,
    );
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO storage.objects VALUES('mall-attachments',$1)",
      [image],
    );
    await as(4);
    await update("resolved", ids[4], "Lampu sudah normal", image);
    await assert.rejects(() => update("closed", ids[4]), /supervisor/);
    await as(9);
    await update("closed", ids[4]);
    // Moving the reporter never rewrites the original sender department.
    await db.exec("RESET ROLE");
    await db.query("UPDATE mall.profiles SET department_id=$1 WHERE id=$2", [
      dept("LEG"),
      ids[1],
    ]);
    await as(1);
    assert.ok(!(await visible()).includes(outgoing.id));
    await as(2);
    assert.ok((await visible()).includes(outgoing.id));
    const directory = (await db.query("SELECT * FROM mall.member_directory()"))
      .rows;
    assert.ok(directory.some((p) => p.id === ids[4]));
    assert.equal(Object.hasOwn(directory[0], "email"), false);
    // Title request has no authority before an administrator approves it.
    await as(11);
    await db.query(
      "SELECT mall.submit_registration('New Manager','08123456789','Assistant Manager','ENG','staff',NULL,NULL)",
    );
    const application = (
      await db.query(
        "SELECT *,updated_at::text AS version FROM mall.registration_requests WHERE user_id=$1",
        [ids[11]],
      )
    ).rows[0];
    const approve = (role = null, department = null, title = null) =>
      db.query(
        "SELECT mall.review_registration($1,$2,'approved',$3,$4,$5,NULL)",
        [ids[11], application.version, role, department, title],
      );
    await assert.rejects(() => approve("executive"), /Hanya admin/);
    await as(9);
    await approve();
    const approved = (
      await db.query("SELECT * FROM mall.profiles WHERE id=$1", [ids[11]])
    ).rows[0];
    assert.equal(approved.role, "assistant_manager");
    assert.equal(approved.department_id, dept("ENG"));
    assert.equal(approved.job_title, application.requested_job_title);
    await assert.rejects(
      () =>
        db.query("SELECT mall.update_member($1,$2,'staff',$3,'Staff',true)", [
          ids[9],
          new Date().toISOString(),
          dept("ENG"),
        ]),
      /Data pengguna berubah|admin sendiri/,
    );
    const selfVersion = await version("profiles", ids[9]);
    await assert.rejects(
      () =>
        db.query("SELECT mall.update_member($1,$2,'staff',$3,'Staff',true)", [
          ids[9],
          selfVersion,
          dept("ENG"),
        ]),
      /admin sendiri/,
    );
    // Duty schedule: only AM+, date scoped, optimistic lock, no direct client write.
    const leader = "00000000-0000-4000-b000-000000000001",
      otherLeader = "00000000-0000-4000-b000-000000000002";
    const duty = (person = leader, expected = null) =>
      db.query("SELECT * FROM mall.set_duty(CURRENT_DATE,$1,$2,NULL)", [
        person,
        expected,
      ]);
    for (const i of [2, 3, 10, 12]) {
      await as(i);
      await assert.rejects(() => duty(), /Assistant Manager/);
    }
    await as(8);
    await duty();
    await assert.rejects(() => duty(), /Jadwal berubah/);
    await assert.rejects(
      () => db.query("DELETE FROM mall.duty_assignments"),
      /permission denied/,
    );
    const dateVersion = (
      await db.query(
        "SELECT updated_at::text AS v FROM mall.duty_assignments WHERE duty_date=CURRENT_DATE",
      )
    ).rows[0].v;
    await duty(otherLeader, dateVersion);
    await as(2);
    assert.equal(
      (await db.query("SELECT * FROM mall.duty_assignments")).rows.length,
      1,
    );
    const round = "50000000-0000-4000-a000-000000000002";
    const save = (person, answers, submit = false, expected = null) =>
      db.query(
        "SELECT * FROM mall.save_mod_round($1,$2,$3,CURRENT_DATE,$4,$5)",
        [round, expected, person, JSON.stringify(answers), submit],
      );
    await assert.rejects(() => save(leader, {}), /Assistant Manager/);
    await as(8);
    await save(leader, {});
    const draftVersion = await version("mod_rounds", round);
    await assert.rejects(
      () => save(leader, {}, true, draftVersion),
      /Lengkapi/,
    );
    const items = (await db.query("SELECT id FROM mall.mod_checklist_items"))
      .rows;
    const answers = Object.fromEntries(
      items.map((i) => [i.id, { status: "ok", notes: "" }]),
    );
    await assert.rejects(
      () => save(leader, answers, true, draftVersion),
      /Leader berbeda/,
    );
    assert.equal(
      (
        await db.query("SELECT status FROM mall.mod_rounds WHERE id=$1", [
          round,
        ])
      ).rows[0].status,
      "draft",
    );
    await save(otherLeader, answers, true, draftVersion);
    await assert.rejects(
      () => save(otherLeader, answers, true, draftVersion),
      /tidak dapat diubah/,
    );
    await as(3);
    assert.equal(
      (await db.query("SELECT * FROM mall.mod_rounds")).rows.length,
      0,
    );
    // All exposed Mall tables require RLS and anonymous RPC execution is revoked.
    await db.exec("RESET ROLE");
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mall' AND c.relkind='r' AND NOT c.relrowsecurity",
        )
      ).rows[0].n,
      0,
    );
    for (const fn of [
      "mall.member_directory()",
      "mall.set_duty(date,uuid,timestamp with time zone,text)",
      "mall.save_mod_round(uuid,timestamp with time zone,uuid,date,jsonb,boolean)",
      "mall.review_registration(uuid,timestamp with time zone,text,text,uuid,text,text)",
    ])
      assert.equal(
        (
          await db.query(
            "SELECT has_function_privilege('anon',$1,'EXECUTE') ok",
            [fn],
          )
        ).rows[0].ok,
        false,
      );
  } finally {
    await db.close();
  }
});
