BEGIN;
-- Additive Mall-only migration. Existing hotel objects and Auth configuration stay intact.
ALTER TABLE mall.profiles ADD COLUMN job_title text CHECK(length(job_title) <= 100);
ALTER TABLE mall.profiles ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE mall.registration_requests (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 2 AND 120),
 email text NOT NULL, phone text NOT NULL CHECK(length(btrim(phone)) BETWEEN 6 AND 30),
 requested_job_title text NOT NULL CHECK(length(btrim(requested_job_title)) BETWEEN 2 AND 100),
 requested_department_id uuid NOT NULL REFERENCES mall.departments(id),
 account_type text NOT NULL CHECK(account_type IN ('staff','tenant')),
 tenant_name text, unit_number text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 review_notes text CHECK(length(review_notes)<=2000),
 reviewed_by uuid REFERENCES mall.profiles(id) ON DELETE SET NULL, reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(account_type<>'tenant' OR (length(btrim(tenant_name))>0 AND length(btrim(unit_number))>0 AND tenant_name IS NOT NULL AND unit_number IS NOT NULL))
);
CREATE TABLE mall.member_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 target_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN ('SUBMITTED','APPROVED','REJECTED','MEMBER_UPDATED')),
 details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registration_status_idx ON mall.registration_requests(status,created_at);
CREATE INDEX registration_department_idx ON mall.registration_requests(requested_department_id);
CREATE INDEX registration_reviewer_idx ON mall.registration_requests(reviewed_by);
CREATE INDEX member_logs_target_idx ON mall.member_logs(target_id,created_at DESC);
CREATE INDEX member_logs_actor_idx ON mall.member_logs(actor_id);
ALTER TABLE mall.registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mall.member_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mall_registration_read ON mall.registration_requests FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR (SELECT mall.my_role())='admin');
CREATE POLICY mall_member_logs_read ON mall.member_logs FOR SELECT TO authenticated
 USING ((SELECT mall.my_role())='admin');
REVOKE ALL ON mall.registration_requests,mall.member_logs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON mall.registration_requests,mall.member_logs TO authenticated;
GRANT ALL ON mall.registration_requests,mall.member_logs TO service_role;

CREATE FUNCTION mall.access_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE member mall.profiles; application mall.registration_requests;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Silakan login.' USING ERRCODE='42501'; END IF;
 SELECT * INTO member FROM mall.profiles WHERE id=auth.uid();
 IF FOUND THEN RETURN jsonb_build_object('status',CASE WHEN member.is_active THEN 'active' ELSE 'inactive' END); END IF;
 SELECT * INTO application FROM mall.registration_requests WHERE user_id=auth.uid();
 RETURN jsonb_build_object('status',coalesce(application.status,'unregistered'),'application',to_jsonb(application)||jsonb_build_object('requested_department_code',(SELECT code FROM mall.departments WHERE id=application.requested_department_id),'requested_department_name',(SELECT name FROM mall.departments WHERE id=application.requested_department_id)));
END; $$;

CREATE FUNCTION mall.submit_registration(p_full_name text,p_phone text,p_job_title text,p_department_code text,p_account_type text,p_tenant_name text DEFAULT NULL,p_unit_number text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dept uuid; verified_email text; previous_status text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Silakan login.' USING ERRCODE='42501'; END IF;
 -- Serialize submissions for this identity. No Auth trigger or hotel-profile synchronization.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT email INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 IF verified_email IS NULL THEN RAISE EXCEPTION 'Verifikasi email sebelum mengajukan akses.'; END IF;
 IF EXISTS(SELECT 1 FROM mall.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Keanggotaan Anda sudah tercatat. Hubungi administrator.'; END IF;
 SELECT status INTO previous_status FROM mall.registration_requests WHERE user_id=auth.uid() FOR UPDATE;
 IF previous_status='pending' THEN RETURN; END IF;
 SELECT id INTO dept FROM mall.departments WHERE code=p_department_code AND is_active;
 IF dept IS NULL THEN RAISE EXCEPTION 'Departemen tidak tersedia.'; END IF;
 IF length(coalesce(p_tenant_name,''))>120 OR length(coalesce(p_unit_number,''))>100 THEN RAISE EXCEPTION 'Data tenant terlalu panjang.'; END IF;
 INSERT INTO mall.registration_requests(user_id,full_name,email,phone,requested_job_title,requested_department_id,account_type,tenant_name,unit_number)
 VALUES(auth.uid(),btrim(p_full_name),verified_email,btrim(p_phone),btrim(p_job_title),dept,p_account_type,nullif(btrim(p_tenant_name),''),nullif(btrim(p_unit_number),''))
 ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,
 requested_job_title=excluded.requested_job_title,requested_department_id=excluded.requested_department_id,
 account_type=excluded.account_type,tenant_name=excluded.tenant_name,unit_number=excluded.unit_number,
 status='pending',review_notes=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=clock_timestamp();
 INSERT INTO mall.member_logs(target_id,actor_id,action,details) VALUES(auth.uid(),auth.uid(),'SUBMITTED',jsonb_build_object('requested_department_id',dept,'requested_job_title',btrim(p_job_title)));
END; $$;

CREATE FUNCTION mall.review_registration(p_user_id uuid,p_expected_updated_at timestamptz,p_decision text,p_role text,p_department_id uuid,p_job_title text,p_notes text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE application mall.registration_requests;
BEGIN
 -- Same lock as member management: prevents a concurrent administrator demotion race.
 PERFORM pg_advisory_xact_lock(734928105);
 IF auth.uid() IS NULL OR mall.my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Hanya admin yang dapat meninjau pendaftaran.' USING ERRCODE='42501'; END IF;
 SELECT * INTO application FROM mall.registration_requests WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR application.status<>'pending' THEN RAISE EXCEPTION 'Pendaftaran tidak lagi menunggu persetujuan.'; END IF;
 IF application.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Data berubah. Muat ulang sebelum meninjau.' USING ERRCODE='40001'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Keputusan tidak valid.'; END IF;
 IF length(coalesce(p_notes,''))>2000 THEN RAISE EXCEPTION 'Catatan terlalu panjang.'; END IF;
 IF p_decision='rejected' AND length(btrim(coalesce(p_notes,'')))<5 THEN RAISE EXCEPTION 'Alasan penolakan minimal 5 karakter.'; END IF;
 IF p_decision='approved' THEN
  IF p_role IS NULL OR p_role NOT IN ('admin','supervisor','staff','tenant') THEN RAISE EXCEPTION 'Peran akses tidak valid.'; END IF;
  IF p_department_id IS NULL OR NOT EXISTS(SELECT 1 FROM mall.departments WHERE id=p_department_id AND is_active) THEN RAISE EXCEPTION 'Admin wajib menetapkan departemen final yang aktif.'; END IF;
  IF length(btrim(coalesce(p_job_title,''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Jabatan final wajib diisi (2–100 karakter).'; END IF;
  IF p_role='tenant' AND (application.tenant_name IS NULL OR application.unit_number IS NULL) THEN RAISE EXCEPTION 'Peran tenant memerlukan nama tenant dan unit dari pendaftar.'; END IF;
  INSERT INTO mall.profiles(id,full_name,email,phone,role,department_id,job_title,tenant_name,unit_number,is_active)
  VALUES(p_user_id,application.full_name,application.email,application.phone,p_role,p_department_id,btrim(p_job_title),application.tenant_name,application.unit_number,true);
 END IF;
 UPDATE mall.registration_requests SET status=p_decision,review_notes=nullif(btrim(p_notes),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=clock_timestamp() WHERE user_id=p_user_id;
 INSERT INTO mall.member_logs(target_id,actor_id,action,details) VALUES(p_user_id,auth.uid(),upper(p_decision),jsonb_build_object('requested_department_id',application.requested_department_id,'final_department_id',CASE WHEN p_decision='approved' THEN p_department_id END,'role',CASE WHEN p_decision='approved' THEN p_role END,'job_title',CASE WHEN p_decision='approved' THEN btrim(p_job_title) END,'notes',p_notes));
END; $$;

CREATE FUNCTION mall.update_member(p_id uuid,p_expected_updated_at timestamptz,p_role text,p_department_id uuid,p_job_title text,p_is_active boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member mall.profiles;
BEGIN
 PERFORM pg_advisory_xact_lock(734928105);
 IF auth.uid() IS NULL OR mall.my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Hanya admin yang dapat mengelola pengguna.' USING ERRCODE='42501'; END IF;
 SELECT * INTO member FROM mall.profiles WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pengguna tidak ditemukan.'; END IF;
 IF member.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Data pengguna berubah. Muat ulang.' USING ERRCODE='40001'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('admin','supervisor','staff','tenant') OR p_is_active IS NULL THEN RAISE EXCEPTION 'Peran atau status tidak valid.'; END IF;
 IF p_id=auth.uid() AND (p_role<>'admin' OR NOT p_is_active) THEN RAISE EXCEPTION 'Anda tidak dapat mencabut akses admin sendiri.'; END IF;
 IF p_department_id IS NULL OR NOT EXISTS(SELECT 1 FROM mall.departments WHERE id=p_department_id AND is_active) THEN RAISE EXCEPTION 'Pilih departemen final yang aktif.'; END IF;
 IF length(btrim(coalesce(p_job_title,''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Jabatan wajib diisi (2–100 karakter).'; END IF;
 IF p_role='tenant' AND (member.tenant_name IS NULL OR member.unit_number IS NULL) THEN RAISE EXCEPTION 'Data tenant dan unit belum tersedia.'; END IF;
 UPDATE mall.profiles SET role=p_role,department_id=p_department_id,job_title=btrim(p_job_title),is_active=p_is_active,updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO mall.member_logs(target_id,actor_id,action,details) VALUES(p_id,auth.uid(),'MEMBER_UPDATED',jsonb_build_object('before',jsonb_build_object('role',member.role,'department_id',member.department_id,'job_title',member.job_title,'is_active',member.is_active),'after',jsonb_build_object('role',p_role,'department_id',p_department_id,'job_title',btrim(p_job_title),'is_active',p_is_active)));
END; $$;
REVOKE EXECUTE ON FUNCTION mall.access_state(),mall.submit_registration(text,text,text,text,text,text,text),mall.review_registration(uuid,timestamptz,text,text,uuid,text,text),mall.update_member(uuid,timestamptz,text,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mall.access_state(),mall.submit_registration(text,text,text,text,text,text,text),mall.review_registration(uuid,timestamptz,text,text,uuid,text,text),mall.update_member(uuid,timestamptz,text,uuid,text,boolean) TO authenticated;
COMMIT;
