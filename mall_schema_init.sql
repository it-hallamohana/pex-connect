-- P-Ex Connect. Run once in SQL Editor. No hotel tables are accessed.
-- Storage bucket is provisioned via Storage API, not database DDL.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mall;
REVOKE ALL ON SCHEMA mall FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA mall TO authenticated, service_role;

CREATE TABLE mall.departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 code text NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mall.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 120),
 email text NOT NULL, phone text,
 role text NOT NULL CHECK(role IN ('admin','supervisor','staff','tenant')),
 department_id uuid REFERENCES mall.departments(id), tenant_name text, unit_number text,
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(role NOT IN ('staff','supervisor') OR department_id IS NOT NULL)
);
CREATE TABLE mall.ticket_counters (day date PRIMARY KEY, value bigint NOT NULL);
CREATE TABLE mall.requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_number text NOT NULL UNIQUE,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 5 AND 160),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 10 AND 5000),
 category text NOT NULL CHECK(length(category) BETWEEN 1 AND 80),
 location text NOT NULL CHECK(length(btrim(location)) BETWEEN 1 AND 160),
 priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','emergency')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','resolved','closed','rejected')),
 department_id uuid NOT NULL REFERENCES mall.departments(id),
 reported_by uuid REFERENCES mall.profiles(id) ON DELETE SET NULL,
 assigned_to uuid REFERENCES mall.profiles(id) ON DELETE SET NULL,
 photo_url text, resolution_photo_url text, resolution_notes text,
 resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status NOT IN ('resolved','closed') OR (resolved_at IS NOT NULL AND length(btrim(resolution_notes)) >= 5 AND resolution_photo_url IS NOT NULL))
);
CREATE TABLE mall.request_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES mall.requests(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES mall.profiles(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN ('CREATED','ASSIGNED','STATUS_CHANGED','COMMENT_ADDED')),
 notes text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_department_idx ON mall.profiles(department_id);
CREATE INDEX requests_department_status_idx ON mall.requests(department_id,status,created_at DESC);
CREATE INDEX requests_reporter_idx ON mall.requests(reported_by,created_at DESC);
CREATE INDEX requests_assignee_idx ON mall.requests(assigned_to);
CREATE INDEX requests_created_idx ON mall.requests(created_at DESC);
CREATE INDEX requests_resolved_idx ON mall.requests(resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX logs_request_idx ON mall.request_logs(request_id,created_at);
CREATE INDEX logs_actor_idx ON mall.request_logs(actor_id);
ALTER TABLE mall.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mall.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mall.ticket_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE mall.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mall.request_logs ENABLE ROW LEVEL SECURITY;

-- Small identity helpers intentionally bypass profile RLS to avoid recursion.
-- They reveal only the caller's own active membership; no arbitrary user argument.
CREATE FUNCTION mall.my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT role FROM mall.profiles WHERE id = (SELECT auth.uid()) AND is_active;
$$;
CREATE FUNCTION mall.my_department() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT department_id FROM mall.profiles WHERE id = (SELECT auth.uid()) AND is_active;
$$;
CREATE POLICY mall_departments_read ON mall.departments FOR SELECT TO authenticated
 USING ((SELECT mall.my_role()) IS NOT NULL);
CREATE POLICY mall_profiles_read ON mall.profiles FOR SELECT TO authenticated
 USING ((SELECT mall.my_role()) IS NOT NULL AND (id = (SELECT auth.uid()) OR (SELECT mall.my_role()) = 'admin'
 OR ((SELECT mall.my_role()) IN ('staff','supervisor') AND department_id = (SELECT mall.my_department()))));
CREATE POLICY mall_requests_read ON mall.requests FOR SELECT TO authenticated
 USING ((SELECT mall.my_role()) IS NOT NULL AND ((SELECT mall.my_role()) = 'admin' OR reported_by = (SELECT auth.uid())
 OR ((SELECT mall.my_role()) IN ('staff','supervisor') AND department_id = (SELECT mall.my_department()))));
CREATE POLICY mall_logs_read ON mall.request_logs FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM mall.requests r WHERE r.id = request_id));

-- Mutations are RPC-only: no client may directly modify profiles, tickets or audit logs.
CREATE FUNCTION mall.create_request(p_title text, p_description text, p_category text, p_location text,
 p_priority text, p_department uuid, p_photo text DEFAULT NULL)
 RETURNS mall.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result mall.requests; seq bigint; today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
 IF auth.uid() IS NULL OR mall.my_role() IS NULL THEN RAISE EXCEPTION 'Akses khusus pengguna Mall aktif.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mall.departments WHERE id=p_department AND is_active) THEN RAISE EXCEPTION 'Departemen tidak aktif.'; END IF;
 IF p_photo IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='mall-attachments' AND name=p_photo) OR split_part(p_photo,'/',1) <> auth.uid()::text OR p_photo !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') THEN RAISE EXCEPTION 'Lampiran tidak valid.'; END IF;
 INSERT INTO mall.ticket_counters(day,value) VALUES(today,1) ON CONFLICT(day) DO UPDATE SET value=mall.ticket_counters.value+1 RETURNING value INTO seq;
 INSERT INTO mall.requests(ticket_number,title,description,category,location,priority,department_id,reported_by,photo_url)
 VALUES('PX-'||to_char(today,'YYYYMMDD')||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),btrim(p_title),btrim(p_description),p_category,btrim(p_location),p_priority,p_department,auth.uid(),p_photo)
 RETURNING * INTO result;
 INSERT INTO mall.request_logs(request_id,actor_id,action,notes) VALUES(result.id,auth.uid(),'CREATED','Tiket dibuat.');
 RETURN result;
END; $$;

CREATE FUNCTION mall.update_request(p_id uuid, p_expected_updated_at timestamptz, p_status text,
 p_assigned_to uuid, p_notes text DEFAULT NULL, p_photo text DEFAULT NULL)
 RETURNS mall.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE oldrow mall.requests; result mall.requests; caller_role text := mall.my_role();
BEGIN
 IF auth.uid() IS NULL OR caller_role IS NULL THEN RAISE EXCEPTION 'Akses khusus pengguna Mall aktif.' USING ERRCODE='42501'; END IF;
 SELECT * INTO oldrow FROM mall.requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT (caller_role='admin' OR (caller_role IN ('staff','supervisor') AND oldrow.department_id=mall.my_department())) THEN RAISE EXCEPTION 'Anda tidak berwenang mengelola tiket ini.' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS DISTINCT FROM oldrow.updated_at THEN RAISE EXCEPTION 'Tiket baru diperbarui rekan Anda. Muat ulang lalu coba kembali.' USING ERRCODE='40001'; END IF;
 IF p_assigned_to IS DISTINCT FROM oldrow.assigned_to AND caller_role NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'Penugasan hanya oleh admin atau supervisor.' USING ERRCODE='42501'; END IF;
 IF p_assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mall.profiles WHERE id=p_assigned_to AND is_active AND role IN ('staff','supervisor','admin') AND department_id=oldrow.department_id) THEN RAISE EXCEPTION 'Petugas harus aktif dan berada di departemen tujuan.'; END IF;
 IF p_status IS NULL OR NOT (p_status=oldrow.status OR (oldrow.status='pending' AND p_status IN ('in_progress','rejected')) OR (oldrow.status='in_progress' AND p_status='resolved') OR (oldrow.status='resolved' AND p_status IN ('closed','in_progress'))) THEN RAISE EXCEPTION 'Transisi status tidak diizinkan.'; END IF;
 IF p_status IN ('closed','rejected') AND p_status<>oldrow.status AND caller_role NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'Hanya supervisor atau admin dapat menutup/menolak tiket.'; END IF;
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

CREATE FUNCTION mall.add_comment(p_id uuid,p_notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR mall.my_role() IS NULL OR NOT EXISTS(SELECT 1 FROM mall.requests WHERE id=p_id AND (mall.my_role()='admin' OR reported_by=auth.uid() OR (mall.my_role() IN ('staff','supervisor') AND department_id=mall.my_department()))) THEN RAISE EXCEPTION 'Akses ditolak.' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_notes,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Komentar harus berisi 1–2000 karakter.'; END IF;
 INSERT INTO mall.request_logs(request_id,actor_id,action,notes) VALUES(p_id,auth.uid(),'COMMENT_ADDED',btrim(p_notes));
END; $$;
REVOKE ALL ON ALL TABLES IN SCHEMA mall FROM anon, authenticated;
GRANT SELECT ON mall.departments,mall.profiles,mall.requests,mall.request_logs TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA mall TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mall FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mall.my_role(),mall.my_department(),mall.create_request(text,text,text,text,text,uuid,text),mall.update_request(uuid,timestamptz,text,uuid,text,text),mall.add_comment(uuid,text) TO authenticated;
INSERT INTO mall.departments(name,code) VALUES ('Engineering','ENG'),('Housekeeping','HK'),('Security','SEC'),('Customer Service','CS'),('Tenant Relations','TR'),('MOD / Duty Manager','MOD');
-- Add only Mall tables; preserve all existing publication members.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE mall.requests,mall.request_logs;
 END IF;
END $$;
COMMIT;
