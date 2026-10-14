import test from "node:test";
import assert from "node:assert/strict";
import {
  canManage,
  transitions,
  jakartaDay,
  validateImage,
  metrics,
} from "../src/lib/domain.mjs";
test("tenant cannot manage tickets, even in same department", () => {
  assert.equal(
    canManage({ role: "tenant", department_id: "a" }, { department_id: "a" }),
    false,
  );
});
test("staff restricted to their department; admin has global management", () => {
  assert.equal(
    canManage({ role: "staff", department_id: "a" }, { department_id: "b" }),
    false,
  );
  assert.equal(
    canManage({ role: "staff", department_id: "a" }, { department_id: "a" }),
    true,
  );
  assert.equal(canManage({ role: "admin" }, { department_id: "b" }), true);
});
test("workflow forbids skipping resolution or reopening closed tickets", () => {
  assert.deepEqual(transitions("pending", "staff"), ["in_progress"]);
  assert.deepEqual(transitions("resolved", "supervisor"), [
    "closed",
    "in_progress",
  ]);
  assert.deepEqual(transitions("closed", "admin"), []);
});
test("daily boundaries use Jakarta, not server timezone", () => {
  assert.equal(jakartaDay("2026-10-12T18:00:00Z"), "2026-10-13");
  assert.equal(jakartaDay("2026-10-12T16:59:59Z"), "2026-10-12");
  assert.deepEqual(metrics([]), [0, 0, 0, 0]);
});
test("reject forged and oversized images", () => {
  assert.equal(
    validateImage(new Uint8Array([1, 2, 3]), "image/jpeg", 3),
    false,
  );
  assert.equal(
    validateImage(
      new Uint8Array([255, 216, 255]),
      "image/jpeg",
      6 * 1024 * 1024,
    ),
    false,
  );
  assert.equal(
    validateImage(new Uint8Array([255, 216, 255]), "image/jpeg", 3),
    true,
  );
  assert.equal(
    validateImage(new Uint8Array([255, 216, 255]), "image/svg+xml", 3),
    false,
  );
});
