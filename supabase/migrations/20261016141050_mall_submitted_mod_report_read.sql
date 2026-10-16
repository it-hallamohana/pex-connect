-- Only the published report matching today's scheduled MOD leader is shared in the duty popup.
-- Drafts and historical reports remain limited to their inspector and global checklist roles.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mall;
DROP POLICY mall_mod_rounds_read ON mall.mod_rounds;
CREATE POLICY mall_mod_rounds_read ON mall.mod_rounds
FOR SELECT TO authenticated
USING (
  (SELECT mall.my_role()) IS NOT NULL
  AND (
    inspector_id = (SELECT auth.uid())
    OR (SELECT mall.has_global_requests())
    OR (
      status = 'submitted'
      AND inspection_date = (now() AT TIME ZONE 'Asia/Jakarta')::date
      AND EXISTS (
        SELECT 1 FROM mall.duty_assignments d
        WHERE d.duty_date = mall.mod_rounds.inspection_date
          AND d.leader_id = mall.mod_rounds.leader_id
      )
    )
  )
);
COMMIT;
