-- Keep tenant contact details access limited to the caller's own profile.
-- Cross-department names/assignments use mall.member_directory(), without contacts.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mall;
DROP POLICY mall_profiles_read ON mall.profiles;
CREATE POLICY mall_profiles_read ON mall.profiles FOR SELECT TO authenticated
USING (
 (SELECT mall.my_role()) IS NOT NULL AND (
  id=(SELECT auth.uid()) OR (SELECT mall.is_administrator()) OR
  ((SELECT mall.my_role()) IN ('staff','supervisor','assistant_manager','manager')
    AND department_id=(SELECT mall.my_department()))
 )
);
COMMIT;
