BEGIN;
CREATE OR REPLACE FUNCTION mall.create_request(p_title text, p_description text, p_category text, p_location text,
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
CREATE OR REPLACE FUNCTION mall.update_request(p_id uuid, p_expected_updated_at timestamptz, p_status text,
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
COMMIT;
