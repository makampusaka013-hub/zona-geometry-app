-- =============================================================================
-- VIEW: AGREGASI SUMBER DAYA PROYEK (RESOURCE SUMMARY)
-- Sumber langsung dari ahsp_lines + view_katalog_ahsp_lengkap (tanpa bergantung snapshot)
-- Sehingga data langsung tersedia setelah AHSP ditambahkan ke proyek.
-- =============================================================================

DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;

CREATE OR REPLACE VIEW public.view_project_resource_summary WITH (security_invoker = true) AS
SELECT
  al.project_id,
  al.bab_pekerjaan,
  
  -- Identitas komponen dari detail katalog
  detail.uraian,
  COALESCE(detail.kode_item, detail.uraian) AS key_item,
  detail.satuan,
  detail.jenis_komponen,
  detail.harga_konversi AS harga_snapshot,
  detail.tkdn AS tkdn_percent,

  -- Kalkulasi nilai berdasarkan volume RAB x subtotal komponen
  SUM(al.volume * detail.koefisien)                          AS total_volume_terpakai,
  SUM(al.volume * detail.subtotal)                           AS kontribusi_nilai,
  SUM(al.volume * detail.subtotal * (detail.tkdn / 100.0))   AS nilai_tkdn

FROM public.ahsp_lines al
JOIN public.view_katalog_ahsp_lengkap vk ON vk.master_ahsp_id = al.master_ahsp_id
CROSS JOIN LATERAL jsonb_to_recordset(vk.details) AS detail(
  uraian        TEXT,
  kode_item     TEXT,
  satuan        TEXT,
  koefisien     NUMERIC,
  harga_konversi NUMERIC,
  jenis_komponen TEXT,
  subtotal      NUMERIC,
  tkdn          NUMERIC
)
WHERE al.master_ahsp_id IS NOT NULL
  AND detail.uraian IS NOT NULL
GROUP BY
  al.project_id,
  al.bab_pekerjaan,
  detail.uraian,
  detail.kode_item,
  detail.satuan,
  detail.jenis_komponen,
  detail.harga_konversi,
  detail.tkdn;

-- Berikan akses ke authenticated user
GRANT SELECT ON public.view_project_resource_summary TO authenticated;

NOTIFY pgrst, 'reload schema';
