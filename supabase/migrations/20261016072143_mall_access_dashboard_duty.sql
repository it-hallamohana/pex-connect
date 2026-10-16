-- Mall-only access and workflow update. No hotel tables or shared Auth configuration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mall;
ALTER TABLE mall.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE mall.profiles ADD CONSTRAINT profiles_role_check CHECK(role IN ('admin','executive','manager','assistant_manager','supervisor','staff','tenant'));
ALTER TABLE mall.profiles DROP CONSTRAINT profiles_check;
ALTER TABLE mall.profiles ADD CONSTRAINT profiles_department_required CHECK(role IN ('admin','executive','tenant') OR department_id IS NOT NULL);
ALTER TABLE mall.requests ADD COLUMN reported_department_id uuid REFERENCES mall.departments(id);
UPDATE mall.requests r SET reported_department_id=p.department_id FROM mall.profiles p WHERE p.id=r.reported_by;
CREATE INDEX requests_sender_status_idx ON mall.requests(reported_department_id,status,created_at DESC);
UPDATE mall.departments SET is_active=false WHERE code='MOD';
-- Existing administrator remains privileged; MOD is not an employment department.
UPDATE mall.profiles SET department_id=NULL,updated_at=clock_timestamp() WHERE role IN ('admin','executive') AND department_id IN (SELECT id FROM mall.departments WHERE code='MOD');
CREATE FUNCTION mall.is_administrator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND coalesce(mall.my_role() IN ('admin','executive'),false);
$$;
CREATE FUNCTION mall.has_global_requests() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND coalesce(mall.my_role() IN ('admin','executive','manager','assistant_manager'),false);
$$;
CREATE FUNCTION mall.role_for_job(p_title text,p_account_type text DEFAULT 'staff') RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_account_type='tenant' THEN 'tenant'
 WHEN lower(btrim(p_title)) IN ('executive','general manager','general manager mall','superadmin') THEN 'executive'
 WHEN lower(btrim(p_title)) IN ('manager','mall manager','department head','chief engineering','hr&ga manager','marcomm manager') THEN 'manager'
 WHEN lower(btrim(p_title)) IN ('assistant manager','asst. it manager','assisten manager','asisten manager') THEN 'assistant_manager'
 WHEN lower(btrim(p_title)) IN ('supervisor','engineering supervisor','accounting & purchasing supervisor') THEN 'supervisor'
 ELSE 'staff' END;
$$;
DROP POLICY mall_requests_read ON mall.requests;
CREATE POLICY mall_requests_read ON mall.requests FOR SELECT TO authenticated USING (
 (SELECT mall.my_role()) IS NOT NULL AND ((SELECT mall.has_global_requests()) OR
 ((SELECT mall.my_role())='tenant' AND reported_by=(SELECT auth.uid())) OR
 ((SELECT mall.my_role()) IN ('staff','supervisor') AND (department_id=(SELECT mall.my_department()) OR reported_department_id=(SELECT mall.my_department()))))
);
DROP POLICY mall_profiles_read ON mall.profiles;
CREATE POLICY mall_profiles_read ON mall.profiles FOR SELECT TO authenticated USING ((SELECT mall.my_role()) IS NOT NULL AND (id=(SELECT auth.uid()) OR (SELECT mall.is_administrator()) OR department_id=(SELECT mall.my_department())));
DROP POLICY mall_registration_read ON mall.registration_requests;
CREATE POLICY mall_registration_read ON mall.registration_requests FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR (SELECT mall.is_administrator()));
DROP POLICY mall_member_logs_read ON mall.member_logs;
CREATE POLICY mall_member_logs_read ON mall.member_logs FOR SELECT TO authenticated USING((SELECT mall.is_administrator()));
CREATE FUNCTION mall.member_directory() RETURNS TABLE(id uuid,full_name text,role text,department_id uuid,is_active boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR mall.my_role() IS NULL THEN RAISE EXCEPTION 'Akses ditolak.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.id,p.full_name,p.role,p.department_id,p.is_active FROM mall.profiles p ORDER BY p.full_name;
END; $$;
CREATE OR REPLACE FUNCTION mall.create_request(p_title text, p_description text, p_category text, p_location text,
 p_priority text, p_department uuid, p_photo text DEFAULT NULL)
 RETURNS mall.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result mall.requests; seq bigint; today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
 IF auth.uid() IS NULL OR mall.my_role() IS NULL THEN RAISE EXCEPTION 'Akses khusus pengguna Mall aktif.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mall.departments WHERE id=p_department AND is_active) THEN RAISE EXCEPTION 'Departemen tidak aktif.'; END IF;
 IF p_photo IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='mall-attachments' AND name=p_photo) OR split_part(p_photo,'/',1) <> auth.uid()::text OR p_photo !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') THEN RAISE EXCEPTION 'Lampiran tidak valid.'; END IF;
 INSERT INTO mall.ticket_counters(day,value) VALUES(today,1) ON CONFLICT(day) DO UPDATE SET value=mall.ticket_counters.value+1 RETURNING value INTO seq;
 INSERT INTO mall.requests(ticket_number,title,description,category,location,priority,department_id,reported_by,photo_url,reported_department_id)
 VALUES('PX-'||to_char(today,'YYYYMMDD')||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),btrim(p_title),btrim(p_description),p_category,btrim(p_location),p_priority,p_department,auth.uid(),p_photo,mall.my_department())
 RETURNING * INTO result;
 INSERT INTO mall.request_logs(request_id,actor_id,action,notes) VALUES(result.id,auth.uid(),'CREATED','Tiket dibuat.');
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION mall.update_request(p_id uuid, p_expected_updated_at timestamptz, p_status text,
 p_assigned_to uuid, p_notes text DEFAULT NULL, p_photo text DEFAULT NULL)
 RETURNS mall.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE oldrow mall.requests; result mall.requests; caller_role text := mall.my_role();
BEGIN
 IF auth.uid() IS NULL OR caller_role IS NULL THEN RAISE EXCEPTION 'Akses khusus pengguna Mall aktif.' USING ERRCODE='42501'; END IF;
 SELECT * INTO oldrow FROM mall.requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT (caller_role IN ('admin','executive') OR (caller_role IN ('staff','supervisor','assistant_manager','manager') AND oldrow.department_id=mall.my_department())) THEN RAISE EXCEPTION 'Anda tidak berwenang mengelola tiket ini.' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS DISTINCT FROM oldrow.updated_at THEN RAISE EXCEPTION 'Tiket baru diperbarui rekan Anda. Muat ulang lalu coba kembali.' USING ERRCODE='40001'; END IF;
 IF p_assigned_to IS DISTINCT FROM oldrow.assigned_to AND caller_role NOT IN ('admin','executive','manager','assistant_manager','supervisor') THEN RAISE EXCEPTION 'Penugasan hanya oleh admin atau supervisor.' USING ERRCODE='42501'; END IF;
 IF p_assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mall.profiles WHERE id=p_assigned_to AND is_active AND role IN ('staff','supervisor','assistant_manager','manager','executive','admin') AND department_id=oldrow.department_id) THEN RAISE EXCEPTION 'Petugas harus aktif dan berada di departemen tujuan.'; END IF;
 IF p_status IS NULL OR NOT (p_status=oldrow.status OR (oldrow.status='pending' AND p_status IN ('in_progress','rejected')) OR (oldrow.status='in_progress' AND p_status='resolved') OR (oldrow.status='resolved' AND p_status IN ('closed','in_progress'))) THEN RAISE EXCEPTION 'Transisi status tidak diizinkan.'; END IF;
 IF p_status IN ('closed','rejected') AND p_status<>oldrow.status AND caller_role NOT IN ('admin','executive','manager','assistant_manager','supervisor') THEN RAISE EXCEPTION 'Hanya supervisor atau admin dapat menutup/menolak tiket.'; END IF;
 IF p_status='rejected' AND length(btrim(coalesce(p_notes,'')))<5 THEN RAISE EXCEPTION 'Alasan penolakan wajib diisi.'; END IF;
 IF p_status='resolved' AND oldrow.status<>'resolved' THEN
  IF length(btrim(coalesce(p_notes,'')))<5 OR p_photo IS NULL THEN RAISE EXCEPTION 'Catatan dan foto penyelesaian wajib diisi.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='mall-attachments' AND name=p_photo) OR split_part(p_photo,'/',1)<>auth.uid()::text OR p_photo !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' THEN RAISE EXCEPTION 'Foto penyelesaian tidak valid.'; END IF;
 END IF;
 IF length(coalesce(p_notes,''))>5000 THEN RAISE EXCEPTION 'Catatan terlalu panjang.'; END IF;
 UPDATE mall.requests SET status=p_status,assigned_to=p_assigned_to,
 resolution_notes=CASE WHEN p_status='resolved' AND oldrow.status<>'resolved' THEN btrim(p_notes) ELSE oldrow.resolution_notes END,
 resolution_photo_url=CASE WHEN p_status='resolved' AND oldrow.status<>'resolved' THEN p_photo ELSE oldrow.resolution_photo_url END,
 resolved_at=CASE WHEN p_status='resolved' AND oldrow.status<>'resolved' THEN now() WHEN p_status='in_progress' THEN NULL ELSE oldrow.resolved_at END,
 updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO result;
 IF p_status IS DISTINCT FROM oldrow.status THEN INSERT INTO mall.request_logs(request_id,actor_id,action,notes) VALUES(p_id,auth.uid(),'STATUS_CHANGED',oldrow.status||' → '||p_status||CASE WHEN nullif(btrim(p_notes),'') IS NOT NULL THEN ': '||btrim(p_notes) ELSE '' END); END IF;
 IF p_assigned_to IS DISTINCT FROM oldrow.assigned_to THEN INSERT INTO mall.request_logs(request_id,actor_id,action,notes) VALUES(p_id,auth.uid(),'ASSIGNED',coalesce((SELECT full_name FROM mall.profiles WHERE id=p_assigned_to),'Penugasan dilepas')); END IF;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION mall.add_comment(p_id uuid,p_notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR mall.my_role() IS NULL OR NOT EXISTS(SELECT 1 FROM mall.requests WHERE id=p_id AND (mall.has_global_requests() OR (mall.my_role()='tenant' AND reported_by=auth.uid()) OR (mall.my_role() IN ('staff','supervisor') AND (department_id=mall.my_department() OR reported_department_id=mall.my_department())))) THEN RAISE EXCEPTION 'Akses ditolak.' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_notes,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Komentar harus berisi 1–2000 karakter.'; END IF;
 INSERT INTO mall.request_logs(request_id,actor_id,action,notes) VALUES(p_id,auth.uid(),'COMMENT_ADDED',btrim(p_notes));
END; $$;
CREATE OR REPLACE FUNCTION mall.review_registration(p_user_id uuid,p_expected_updated_at timestamptz,p_decision text,p_role text,p_department_id uuid,p_job_title text,p_notes text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE application mall.registration_requests;
BEGIN
 -- Same lock as member management: prevents a concurrent administrator demotion race.
 PERFORM pg_advisory_xact_lock(734928105);
 IF auth.uid() IS NULL OR NOT mall.is_administrator() THEN RAISE EXCEPTION 'Hanya admin yang dapat meninjau pendaftaran.' USING ERRCODE='42501'; END IF;
 SELECT * INTO application FROM mall.registration_requests WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR application.status<>'pending' THEN RAISE EXCEPTION 'Pendaftaran tidak lagi menunggu persetujuan.'; END IF;
 IF application.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Data berubah. Muat ulang sebelum meninjau.' USING ERRCODE='40001'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Keputusan tidak valid.'; END IF;
 IF length(coalesce(p_notes,''))>2000 THEN RAISE EXCEPTION 'Catatan terlalu panjang.'; END IF;
 IF p_decision='rejected' AND length(btrim(coalesce(p_notes,'')))<5 THEN RAISE EXCEPTION 'Alasan penolakan minimal 5 karakter.'; END IF;
 IF p_decision='approved' THEN
  p_department_id:=coalesce(p_department_id,application.requested_department_id);
  p_job_title:=coalesce(nullif(btrim(p_job_title),''),application.requested_job_title);
  p_role:=coalesce(p_role,mall.role_for_job(p_job_title,application.account_type));
  IF p_role IS NULL OR p_role NOT IN ('admin','executive','manager','assistant_manager','supervisor','staff','tenant') THEN RAISE EXCEPTION 'Peran akses tidak valid.'; END IF;
  IF p_department_id IS NULL OR NOT EXISTS(SELECT 1 FROM mall.departments WHERE id=p_department_id AND is_active) THEN RAISE EXCEPTION 'Admin wajib menetapkan departemen final yang aktif.'; END IF;
  IF length(btrim(coalesce(p_job_title,''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Jabatan final wajib diisi (2–100 karakter).'; END IF;
  IF p_role='tenant' AND (application.tenant_name IS NULL OR application.unit_number IS NULL) THEN RAISE EXCEPTION 'Peran tenant memerlukan nama tenant dan unit dari pendaftar.'; END IF;
  INSERT INTO mall.profiles(id,full_name,email,phone,role,department_id,job_title,tenant_name,unit_number,is_active)
  VALUES(p_user_id,application.full_name,application.email,application.phone,p_role,p_department_id,btrim(p_job_title),application.tenant_name,application.unit_number,true);
 END IF;
 UPDATE mall.registration_requests SET status=p_decision,review_notes=nullif(btrim(p_notes),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=clock_timestamp() WHERE user_id=p_user_id;
 INSERT INTO mall.member_logs(target_id,actor_id,action,details) VALUES(p_user_id,auth.uid(),upper(p_decision),jsonb_build_object('requested_department_id',application.requested_department_id,'final_department_id',CASE WHEN p_decision='approved' THEN p_department_id END,'role',CASE WHEN p_decision='approved' THEN p_role END,'job_title',CASE WHEN p_decision='approved' THEN btrim(p_job_title) END,'notes',p_notes));
END; $$;
CREATE OR REPLACE FUNCTION mall.update_member(p_id uuid,p_expected_updated_at timestamptz,p_role text,p_department_id uuid,p_job_title text,p_is_active boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member mall.profiles;
BEGIN
 PERFORM pg_advisory_xact_lock(734928105);
 IF auth.uid() IS NULL OR NOT mall.is_administrator() THEN RAISE EXCEPTION 'Hanya admin yang dapat mengelola pengguna.' USING ERRCODE='42501'; END IF;
 SELECT * INTO member FROM mall.profiles WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pengguna tidak ditemukan.'; END IF;
 IF member.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Data pengguna berubah. Muat ulang.' USING ERRCODE='40001'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('admin','executive','manager','assistant_manager','supervisor','staff','tenant') OR p_is_active IS NULL THEN RAISE EXCEPTION 'Peran atau status tidak valid.'; END IF;
 IF p_id=auth.uid() AND (p_role NOT IN ('admin','executive') OR NOT p_is_active) THEN RAISE EXCEPTION 'Anda tidak dapat mencabut akses admin sendiri.'; END IF;
 IF (p_department_id IS NULL AND p_role NOT IN ('admin','executive')) OR (p_department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mall.departments WHERE id=p_department_id AND is_active)) THEN RAISE EXCEPTION 'Pilih departemen final yang aktif.'; END IF;
 IF length(btrim(coalesce(p_job_title,''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Jabatan wajib diisi (2–100 karakter).'; END IF;
 IF p_role='tenant' AND (member.tenant_name IS NULL OR member.unit_number IS NULL) THEN RAISE EXCEPTION 'Data tenant dan unit belum tersedia.'; END IF;
 UPDATE mall.profiles SET role=p_role,department_id=p_department_id,job_title=btrim(p_job_title),is_active=p_is_active,updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO mall.member_logs(target_id,actor_id,action,details) VALUES(p_id,auth.uid(),'MEMBER_UPDATED',jsonb_build_object('before',jsonb_build_object('role',member.role,'department_id',member.department_id,'job_title',member.job_title,'is_active',member.is_active),'after',jsonb_build_object('role',p_role,'department_id',p_department_id,'job_title',btrim(p_job_title),'is_active',p_is_active)));
END; $$;
CREATE TABLE mall.duty_assignments (
 duty_date date PRIMARY KEY, leader_id uuid NOT NULL REFERENCES mall.leaders(id), assigned_by uuid NOT NULL REFERENCES mall.profiles(id), notes text CHECK(length(notes)<=500), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX duty_leader_idx ON mall.duty_assignments(leader_id);
CREATE INDEX duty_assigned_by_idx ON mall.duty_assignments(assigned_by);
ALTER TABLE mall.duty_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mall_duty_read ON mall.duty_assignments FOR SELECT TO authenticated USING ((SELECT mall.my_role()) IS NOT NULL);
REVOKE ALL ON mall.duty_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON mall.duty_assignments TO authenticated;
GRANT ALL ON mall.duty_assignments TO service_role;
CREATE FUNCTION mall.set_duty(p_date date,p_leader_id uuid,p_expected_updated_at timestamptz DEFAULT NULL,p_notes text DEFAULT NULL) RETURNS mall.duty_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oldrow mall.duty_assignments; result mall.duty_assignments;
BEGIN
 IF NOT mall.has_global_requests() THEN RAISE EXCEPTION 'Penetapan MOD hanya untuk Assistant Manager ke atas.' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_leader_id IS NULL OR NOT EXISTS(SELECT 1 FROM mall.leaders WHERE id=p_leader_id AND is_active) THEN RAISE EXCEPTION 'Pilih tanggal dan leader aktif.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mall:duty:'||p_date::text,0));
 SELECT * INTO oldrow FROM mall.duty_assignments WHERE duty_date=p_date FOR UPDATE;
 IF (FOUND AND oldrow.updated_at IS DISTINCT FROM p_expected_updated_at) OR (NOT FOUND AND p_expected_updated_at IS NOT NULL) THEN RAISE EXCEPTION 'Jadwal berubah. Muat ulang.' USING ERRCODE='40001'; END IF;
 INSERT INTO mall.duty_assignments(duty_date,leader_id,assigned_by,notes) VALUES(p_date,p_leader_id,auth.uid(),nullif(btrim(p_notes),'')) ON CONFLICT(duty_date) DO UPDATE SET leader_id=excluded.leader_id,assigned_by=excluded.assigned_by,notes=excluded.notes,updated_at=clock_timestamp() RETURNING * INTO result;
 INSERT INTO mall.member_logs(target_id,actor_id,action,details) VALUES(auth.uid(),auth.uid(),'DUTY_ASSIGNED',jsonb_build_object('date',p_date,'before_leader',oldrow.leader_id,'leader_id',p_leader_id));
 RETURN result;
END; $$;
ALTER TABLE mall.member_logs DROP CONSTRAINT member_logs_action_check;
ALTER TABLE mall.member_logs ADD CONSTRAINT member_logs_action_check CHECK(action IN ('SUBMITTED','APPROVED','REJECTED','MEMBER_UPDATED','DUTY_ASSIGNED'));
DROP POLICY mall_mod_rounds_read ON mall.mod_rounds;
CREATE POLICY mall_mod_rounds_read ON mall.mod_rounds FOR SELECT TO authenticated USING ((SELECT mall.my_role()) IS NOT NULL AND (inspector_id=(SELECT auth.uid()) OR (SELECT mall.has_global_requests())));
CREATE OR REPLACE FUNCTION mall.save_mod_round(p_id uuid,p_expected_updated_at timestamptz,p_leader_id uuid,p_date date,p_answers jsonb,p_submit boolean DEFAULT false)
RETURNS mall.mod_rounds LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oldrow mall.mod_rounds; result mall.mod_rounds; entry record; role_name text:=mall.my_role();
BEGIN
 IF NOT mall.has_global_requests() THEN RAISE EXCEPTION 'Checklist MOD hanya untuk Assistant Manager ke atas.' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_date IS NULL OR p_date > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN RAISE EXCEPTION 'Tanggal pemeriksaan tidak valid.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mall.leaders WHERE id=p_leader_id AND is_active) THEN RAISE EXCEPTION 'Pilih leader MOD aktif.'; END IF;
 IF p_answers IS NULL OR jsonb_typeof(p_answers)<>'object' OR pg_column_size(p_answers)>250000 THEN RAISE EXCEPTION 'Jawaban checklist tidak valid.'; END IF;
 FOR entry IN SELECT key,value FROM jsonb_each(p_answers) LOOP
  IF NOT EXISTS(SELECT 1 FROM mall.mod_checklist_items WHERE id=entry.key) OR jsonb_typeof(entry.value)<>'object' OR coalesce(entry.value->>'status','') NOT IN ('ok','issue','na') OR length(coalesce(entry.value->>'notes',''))>1000 THEN RAISE EXCEPTION 'Butir atau jawaban checklist tidak valid.'; END IF;
  IF coalesce(p_submit,false) AND entry.value->>'status'='issue' AND length(btrim(coalesce(entry.value->>'notes','')))<5 THEN RAISE EXCEPTION 'Temuan perlu catatan minimal 5 karakter.'; END IF;
 END LOOP;
 IF coalesce(p_submit,false) AND (SELECT count(*) FROM jsonb_object_keys(p_answers))<>(SELECT count(*) FROM mall.mod_checklist_items) THEN RAISE EXCEPTION 'Lengkapi semua butir sebelum mengirim checklist.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO oldrow FROM mall.mod_rounds WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF oldrow.inspector_id<>auth.uid() THEN RAISE EXCEPTION 'Checklist ini milik pengguna lain.' USING ERRCODE='42501'; END IF;
  IF oldrow.status='submitted' THEN RAISE EXCEPTION 'Checklist terkirim tidak dapat diubah.'; END IF;
  IF oldrow.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Draft berubah. Muat ulang sebelum menyimpan.' USING ERRCODE='40001'; END IF;
  UPDATE mall.mod_rounds SET leader_id=p_leader_id,inspection_date=p_date,answers=p_answers,status=CASE WHEN coalesce(p_submit,false) THEN 'submitted' ELSE 'draft' END,submitted_at=CASE WHEN coalesce(p_submit,false) THEN now() ELSE NULL END,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO result;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Draft tidak ditemukan.'; END IF;
  INSERT INTO mall.mod_rounds(id,inspector_id,leader_id,inspection_date,answers,status,submitted_at) VALUES(p_id,auth.uid(),p_leader_id,p_date,p_answers,CASE WHEN coalesce(p_submit,false) THEN 'submitted' ELSE 'draft' END,CASE WHEN coalesce(p_submit,false) THEN now() ELSE NULL END) RETURNING * INTO result;
 END IF;
 IF coalesce(p_submit,false) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('mall:duty:'||p_date::text,0));
  IF EXISTS(SELECT 1 FROM mall.duty_assignments WHERE duty_date=p_date AND leader_id<>p_leader_id) THEN RAISE EXCEPTION 'Leader berbeda dari jadwal MOD. Sesuaikan jadwal atau pilihan leader.'; END IF;
  INSERT INTO mall.duty_assignments(duty_date,leader_id,assigned_by,notes) VALUES(p_date,p_leader_id,auth.uid(),'Dari checklist MOD terkirim') ON CONFLICT(duty_date) DO NOTHING;
 END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION mall.is_administrator(),mall.has_global_requests(),mall.role_for_job(text,text),mall.member_directory(),mall.set_duty(date,uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mall.is_administrator(),mall.has_global_requests(),mall.role_for_job(text,text),mall.member_directory(),mall.set_duty(date,uuid,timestamptz,text) TO authenticated;
COMMIT;
