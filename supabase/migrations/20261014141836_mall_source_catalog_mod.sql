-- Authoritative source: Checklist PX - Connect (MOD, Operasional Mall, Leader Photo).
-- Only mall objects; old department IDs and references remain intact.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mall;
INSERT INTO mall.departments(code,name,is_active) VALUES
('GA','General Affair',true),
('HR','Human Resource',true),
('LEG','Legal Department',true),
('ENG','Engineering',true),
('MKT','Marketing',true),
('MCOM','Marcomm',true),
('MOD','MOD',true)
ON CONFLICT(code) DO UPDATE SET name=excluded.name,is_active=true;
UPDATE mall.departments SET is_active=false WHERE code NOT IN ('GA','HR','LEG','ENG','MKT','MCOM','MOD');

CREATE TABLE mall.leaders (
 id uuid PRIMARY KEY, full_name text NOT NULL, job_title text NOT NULL, photo_path text NOT NULL CHECK(photo_path ~ '^leaders/source-v1-[1-7]\.jpg$'), sort_order integer NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE mall.mod_checklist_items (
 id text PRIMARY KEY, floor text NOT NULL, area text NOT NULL, title text NOT NULL, sort_order integer NOT NULL
);
CREATE TABLE mall.mod_rounds (
 id uuid PRIMARY KEY, inspector_id uuid NOT NULL REFERENCES mall.profiles(id), leader_id uuid NOT NULL REFERENCES mall.leaders(id), inspection_date date NOT NULL,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answers)='object'), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz
);
CREATE INDEX mod_rounds_inspector_date_idx ON mall.mod_rounds(inspector_id,inspection_date DESC);
CREATE INDEX mod_rounds_leader_idx ON mall.mod_rounds(leader_id);
ALTER TABLE mall.leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mall.mod_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mall.mod_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY mall_leaders_read ON mall.leaders FOR SELECT TO authenticated USING ((SELECT mall.my_role()) IS NOT NULL);
CREATE POLICY mall_mod_items_read ON mall.mod_checklist_items FOR SELECT TO authenticated USING ((SELECT mall.my_role()) IS NOT NULL);
CREATE POLICY mall_mod_rounds_read ON mall.mod_rounds FOR SELECT TO authenticated USING ((SELECT mall.my_role()) IS NOT NULL AND (inspector_id=(SELECT auth.uid()) OR (SELECT mall.my_role())='admin'));
REVOKE ALL ON mall.leaders,mall.mod_checklist_items,mall.mod_rounds FROM anon,authenticated;
GRANT SELECT ON mall.leaders,mall.mod_checklist_items,mall.mod_rounds TO authenticated;
GRANT ALL ON mall.leaders,mall.mod_checklist_items,mall.mod_rounds TO service_role;
INSERT INTO mall.leaders(id,full_name,job_title,photo_path,sort_order) VALUES
('00000000-0000-4000-b000-000000000001','Rudy Alamsyah Siregar','General Manager','leaders/source-v1-1.jpg',1),
('00000000-0000-4000-b000-000000000002','Marthin Aldian Sipahelut','HR&GA Manager','leaders/source-v1-2.jpg',2),
('00000000-0000-4000-b000-000000000003','Gushendri','Chief Engineering','leaders/source-v1-3.jpg',3),
('00000000-0000-4000-b000-000000000004','Peli Perdana Lauser','Marcomm Manager','leaders/source-v1-4.jpg',4),
('00000000-0000-4000-b000-000000000005','Dodi Ansyahri Hasibuan','Asst. IT Manager','leaders/source-v1-5.jpg',5),
('00000000-0000-4000-b000-000000000006','Widya August Mucra','Accounting & Purchasing Supervisor','leaders/source-v1-6.jpg',6),
('00000000-0000-4000-b000-000000000007','Rijon Wendra','Engineering Supervisor','leaders/source-v1-7.jpg',7);
INSERT INTO mall.mod_checklist_items(id,floor,area,title,sort_order) VALUES
('mod-5','Basement','Parkir Motor','Kebersihan area',5),
('mod-6','Basement','Parkir Motor','Penerangan lampu',6),
('mod-7','Basement','Parkir Motor','Titik buta (blind spot)',7),
('mod-8','Basement','Parkir Motor','Kelancaran arus lalu lintas kendaraan',8),
('mod-9','Basement','Parkir Motor','Kondisi toilet unisex',9),
('mod-11','Basement','Parkir Mobil','Kebersihan area',11),
('mod-12','Basement','Parkir Mobil','Penerangan lampu',12),
('mod-13','Basement','Parkir Mobil','Titik buta (blind spot)',13),
('mod-14','Basement','Parkir Mobil','Kelancaran arus lalu lintas kendaraan',14),
('mod-16','Basement','Gate Masuk Kendaraan','Sistem palang pintu (barrier gate)',16),
('mod-17','Basement','Gate Masuk Kendaraan','Antrian kendaraan',17),
('mod-19','Basement','Gate Keluar Kendaraan','Kesiapan petugas',19),
('mod-20','Basement','Gate Keluar Kendaraan','Sistem palang pintu (barrier gate)',20),
('mod-21','Basement','Gate Keluar Kendaraan','Antrian kendaraan',21),
('mod-23','Basement','Ruang Pompa','Potensi genangan air',23),
('mod-24','Basement','Ruang Pompa','Kondisi pipa air bersih',24),
('mod-25','Basement','Ruang Pompa','Kondisi pipa air kotor',25),
('mod-27','Basement','Sumur Resapan','Kondisi pipa sumpit',27),
('mod-28','Basement','Sumur Resapan','Potensi genangan air',28),
('mod-29','Basement','Sumur Resapan','Kondisi pipa air bersih',29),
('mod-30','Basement','Sumur Resapan','Kondisi pipa air kotor',30),
('mod-32','Basement','Ruang Panel Listrik','Kondisi panel alarm',32),
('mod-33','Basement','Ruang Panel Listrik','Kondisi suhu ruangan',33),
('mod-35','Basement','Ruang Panel Genset','Kondisi panel alarm',35),
('mod-36','Basement','Ruang Panel Genset','Kondisi suhu ruangan',36),
('mod-38','Basement','Lift Pengunjung','Kondisi operasional lift',38),
('mod-39','Basement','Lift Pengunjung','Antrian pengunjung mall',39),
('mod-40','Basement','Lift Pengunjung','Jalur evakuasi pengunjung',40),
('mod-41','Basement','Lift Pengunjung','Penerangan di dalam lift pengunjung',41),
('mod-43','Basement','Lift Barang','Kondisi operasional lift',43),
('mod-44','Basement','Lift Barang','Penerangan di dalam lift pengunjung',44),
('mod-46','Lantai LG','Main Entrance','Kesiapan dan kerapian petugas security',46),
('mod-47','Lantai LG','Main Entrance','Kebersihan area plataran',47),
('mod-48','Lantai LG','Main Entrance','Penerangan area plataran',48),
('mod-49','Lantai LG','Main Entrance','Kondisi kolam air mancur',49),
('mod-50','Lantai LG','Main Entrance','Kondisi pintu otomatis',50),
('mod-51','Lantai LG','Main Entrance','Activity tenant',51),
('mod-52','Lantai LG','Main Entrance','Suhu ruangan lantai LG',52),
('mod-53','Lantai LG','Main Entrance','Penerangan area lantai LG',53),
('mod-54','Lantai LG','Main Entrance','Kondisi lift pengunjung',54),
('mod-55','Lantai LG','Main Entrance','Kondisi eskalator lantai LG',55),
('mod-56','Lantai LG','Main Entrance','Jalur evakuasi pengunjung',56),
('mod-57','Lantai LG','Main Entrance','Kondisi operasional lift barang',57),
('mod-59','Lantai G','Main Lobby','Kesiapan dan kerapian Customer Service',59),
('mod-60','Lantai G','Main Lobby','Kondisi pintu otomatis',60),
('mod-62','Lantai G','Main Atrium','Operasional tenant',62),
('mod-63','Lantai G','Main Atrium','Kebersihan area atrium',63),
('mod-64','Lantai G','Main Atrium','Kondisi event yang sedang berlangsung',64),
('mod-65','Lantai G','Main Atrium','Suhu ruangan main atrium',65),
('mod-66','Lantai G','Main Atrium','Kondisi tenant kosong',66),
('mod-67','Lantai G','Main Atrium','Kondisi pintu otomatis',67),
('mod-68','Lantai G','Main Atrium','Kondisi lift pengunjung',68),
('mod-69','Lantai G','Main Atrium','Kondisi eskalator lantai G',69),
('mod-70','Lantai G','Main Atrium','Penerangan area lantai G',70),
('mod-71','Lantai G','Main Atrium','Kondisi toilet pengunjung',71),
('mod-72','Lantai G','Main Atrium','Jalur evakuasi pengunjung',72),
('mod-74','Lantai G','Loading Dock','Kesiapan dan Kebersihan petugas security',74),
('mod-75','Lantai G','Loading Dock','Kebersihan area loading dock',75),
('mod-76','Lantai G','Loading Dock','Operasional di sekitar area loading dock',76),
('mod-77','Lantai G','Loading Dock','Kondisi operasional lift barang',77),
('mod-79','Lantai G','Alfresco','Operasional tenant',79),
('mod-80','Lantai G','Alfresco','Suhu ruangan area alfresco',80),
('mod-81','Lantai G','Alfresco','Kondisi koridor alfresco',81),
('mod-82','Lantai G','Alfresco','Kondisi tenant kosong',82),
('mod-83','Lantai G','Alfresco','Kondisi pintu masuk dan keluar',83),
('mod-84','Lantai G','Alfresco','Penerangan area Alfresco',84),
('mod-86','Lantai UG','All area','Operasional tenant',86),
('mod-87','Lantai UG','All area','Suhu area lantai UG',87),
('mod-88','Lantai UG','All area','Kebersihan area lantai UG',88),
('mod-89','Lantai UG','All area','Kondisi koridor lantai UG',89),
('mod-90','Lantai UG','All area','Kondisi tenant kosong',90),
('mod-91','Lantai UG','All area','Kondisi lift pengunjung',91),
('mod-92','Lantai UG','All area','Kondisi eskalator pengunjung',92),
('mod-93','Lantai UG','All area','Kondisi toilet pengunjung',93),
('mod-94','Lantai UG','All area','Kondisi penerangan lantai UG',94),
('mod-95','Lantai UG','All area','Jalur evakuasi pengunjung',95),
('mod-96','Lantai UG','All area','Kondisi operasional lift barang',96),
('mod-98','Lantai 1','All area','Operasional tenant',98),
('mod-99','Lantai 1','All area','Suhu area lantai 1',99),
('mod-100','Lantai 1','All area','Kebersihan area lantai 1',100),
('mod-101','Lantai 1','All area','Kondisi koridor lantai 1',101),
('mod-102','Lantai 1','All area','Kondisi tenant kosong',102),
('mod-103','Lantai 1','All area','Kondisi lift pengunjung',103),
('mod-104','Lantai 1','All area','Kondisi eskalator pengunjung',104),
('mod-105','Lantai 1','All area','Kondisi toilet pengunjung',105),
('mod-106','Lantai 1','All area','Kondisi penerangan lantai 1',106),
('mod-107','Lantai 1','All area','Jalur evakuasi pengunjung',107),
('mod-108','Lantai 1','All area','Kondisi operasional lift barang',108),
('mod-110','Lantai 2','All area','Operasional tenant',110),
('mod-111','Lantai 2','All area','Operasional di area foodcourt',111),
('mod-112','Lantai 2','All area','Suhu area lantai 2',112),
('mod-113','Lantai 2','All area','Kebersihan area lantai 2',113),
('mod-114','Lantai 2','All area','Kondisi koridor lantai 2',114),
('mod-115','Lantai 2','All area','Kondisi tenant kosong',115),
('mod-116','Lantai 2','All area','Kondisi lift pengunjung',116),
('mod-117','Lantai 2','All area','Kondisi eskalator pengunjung',117),
('mod-118','Lantai 2','All area','Kondisi toilet pengunjung',118),
('mod-119','Lantai 2','All area','Kondisi penerangan lantai 2',119),
('mod-120','Lantai 2','All area','Jalur evakuasi pengunjung',120),
('mod-121','Lantai 2','All area','Kondisi area Mushola',121),
('mod-122','Lantai 2','All area','Kondisi operasional lift barang',122),
('mod-124','Lantai 3','All area','Operasional tenant',124),
('mod-125','Lantai 3','All area','Suhu area lantai 3',125),
('mod-126','Lantai 3','All area','Kebersihan area lantai 3',126),
('mod-127','Lantai 3','All area','Kondisi koridor lantai 3',127),
('mod-128','Lantai 3','All area','Kondisi penerangan lantai 3',128),
('mod-129','Lantai 3','All area','Jalur evakuasi pengunjung',129),
('mod-130','Lantai 3','All area','Kondisi operasional lift barang',130),
('mod-132','Utilitas khusus','Ruang AHU','Kondisi operasional AHU gedung',132),
('mod-134','Utilitas khusus','Ruang STP','Kelancaran pompa blower',134),
('mod-135','Utilitas khusus','Ruang STP','Indikator panel kontrol STP',135),
('mod-136','Utilitas khusus','Ruang STP','Kondisi bak kontrol STP',136),
('mod-138','Utilitas khusus','Ruang Kontrol CCTV','Kondisi operasional seluruh CCTV gedung',138),
('mod-140','Fasilitas karyawan','Loker Perempuan','Kondisi area loker perempuan',140),
('mod-142','Fasilitas karyawan','Loker Laki-laki','Kondisi area loker laki-laki',142),
('mod-144','Fire system','Fire Alarm Control Panel','Kondisi panel fire alarm',144),
('mod-146','Fire system','Hydrant Box','Kondisi cover hydrant dan nozzle',146);
CREATE FUNCTION mall.save_mod_round(p_id uuid,p_expected_updated_at timestamptz,p_leader_id uuid,p_date date,p_answers jsonb,p_submit boolean DEFAULT false)
RETURNS mall.mod_rounds LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oldrow mall.mod_rounds; result mall.mod_rounds; entry record; role_name text:=mall.my_role();
BEGIN
 IF auth.uid() IS NULL OR role_name IS NULL OR NOT (role_name IN ('admin','supervisor') OR (role_name='staff' AND EXISTS(SELECT 1 FROM mall.departments WHERE id=mall.my_department() AND code='MOD' AND is_active))) THEN RAISE EXCEPTION 'Checklist MOD hanya untuk admin, supervisor, atau staf MOD.' USING ERRCODE='42501'; END IF;
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
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION mall.save_mod_round(uuid,timestamptz,uuid,date,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mall.save_mod_round(uuid,timestamptz,uuid,date,jsonb,boolean) TO authenticated;
COMMIT;
