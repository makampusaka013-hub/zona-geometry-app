import { supabase } from '@/lib/supabase';
import { ProjectIdentitySchema, RabLinesSchema } from '../validations/rabSchema';

/**
 * Service for handling RAB (Rencana Anggaran Biaya) data.
 * Follows the "Strangler Fig" pattern - decoupled from the UI.
 */

/**
 * Fetch a single project by ID.
 * @param {string} projectId 
 */
export const fetchProjectById = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in fetchProjectById:', error);
    return { data: null, error };
  }
};

/**
 * Fetch all RAB lines (ahsp_lines) for a specific project.
 * @param {string} projectId 
 */
export const fetchRabByProjectId = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('ahsp_lines')
      .select('*, master_ahsp(kode_ahsp)')
      .eq('project_id', projectId)
      .order('sort_order');
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in fetchRabByProjectId:', error);
    return { data: null, error };
  }
};

/**
 * Fetch master data for lookup (Katalog AHSP and Price Overrides).
 * @param {Array} ahspIds 
 */
export const fetchRabMasterData = async (ahspIds) => {
  try {
    const [mastersRes, overridesRes] = await Promise.all([
      supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', ahspIds),
      supabase.from('master_harga_custom').select('kode_item, harga_satuan')
    ]);

    if (mastersRes.error) throw mastersRes.error;
    if (overridesRes.error) throw overridesRes.error;

    return { 
      data: { 
        masters: mastersRes.data, 
        overrides: overridesRes.data 
      }, 
      error: null 
    };
  } catch (error) {
    console.error('Error in fetchRabMasterData:', error);
    return { data: null, error };
  }
};

/**
 * Save or update project identity.
 * @param {string|null} projectId 
 * @param {Object} payload 
 */
export const upsertProject = async (projectId, payload) => {
  try {
    // Validate payload before saving
    const validation = ProjectIdentitySchema.safeParse(payload);
    if (!validation.success) {
      const errorMsg = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return { data: null, error: new Error(`Validasi Gagal: ${errorMsg}`) };
    }

    if (projectId) {
      const { data, error } = await supabase
        .from('projects')
        .update(payload)
        .eq('id', projectId)
        .select()
        .single();
      if (error) throw error;
      return { data, error: null };
    } else {
      const { data, error } = await supabase
        .from('projects')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data, error: null };
    }
  } catch (error) {
    console.error('Error in upsertProject:', error);
    return { data: null, error };
  }
};

/**
 * Delete RAB items that are no longer in the kept list.
 * @param {string} projectId 
 * @param {Array} keptIds 
 */
export const deleteRemovedRabItems = async (projectId, keptIds) => {
  try {
    let query = supabase.from('ahsp_lines').delete().eq('project_id', projectId);
    
    if (keptIds && keptIds.length > 0) {
      query = query.not('id', 'in', `(${keptIds.join(',')})`);
    }
    
    const { error } = await query;
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error in deleteRemovedRabItems:', error);
    return { error };
  }
};

/**
 * Save or update RAB items (ahsp_lines).
 * @param {Array} items 
 */
export const upsertRabItems = async (items) => {
  try {
    if (!items || items.length === 0) return { data: [], error: null };
    
    // Validate items before saving
    const validation = RabLinesSchema.safeParse(items);
    if (!validation.success) {
      const errorMsg = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return { data: null, error: new Error(`Validasi Data RAB Gagal: ${errorMsg}`) };
    }

    const { data, error } = await supabase
      .from('ahsp_lines')
      .upsert(items);
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in upsertRabItems:', error);
    return { data: null, error };
  }
};

/**
 * Fetch locations for project identity selection.
 */
export const fetchLocations = async () => {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in fetchLocations:', error);
    return { data: null, error };
  }
};

/**
 * Fetch maximum LS number for generating next code.
 */
export const fetchMaxLumsumCode = async () => {
  try {
    const { data, error } = await supabase
      .from('master_harga_custom')
      .select('kode_item')
      .ilike('kode_item', 'LS.%');
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in fetchMaxLumsumCode:', error);
    return { data: null, error };
  }
};

/**
 * Save a custom item to the master catalog.
 * @param {Object} item 
 */
export const saveToMasterCatalog = async (item) => {
  try {
    const { data, error } = await supabase
      .from('master_harga_custom')
      .insert(item);
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in saveToMasterCatalog:', error);
    return { data: null, error };
  }
};
/**
 * Fetch comprehensive tab data for a project based on the active tab.
 * @param {string} tab - The active tab ID.
 * @param {string} projectId - The project ID.
 * @param {string} currentProjectObj - Current project metadata for profit fallbacks.
 */
export const getProjectTabData = async (tab, projectId, currentProjectObj = null) => {
  try {
    const { data: overrides } = await supabase.from('master_harga_custom').select('kode_item, harga_satuan, tkdn_percent, id');
    const overrideMap = Object.fromEntries((overrides || []).map(o => [o.kode_item, o]));

    if (tab === 'proyek' || tab === 'progress' || tab === 'schedule' || tab === 'export') {
      const [effectiveRes, linesRes, backupRes, resourcesRes] = await Promise.all([
        supabase.rpc('get_effective_project_budget', { p_project_id: projectId }),
        supabase.from('ahsp_lines').select('*, master_ahsp(kode_ahsp)').eq('project_id', projectId).order('bab_pekerjaan'),
        supabase.from('project_backup_volume').select('*').eq('project_id', projectId),
        supabase.rpc('get_project_resource_aggregation', { p_project_id: projectId })
      ]);

      const effectiveItems = effectiveRes.data;
      const lines = linesRes.data;
      const backup = backupRes.data;

      const processedLines = (lines || []).map(l => {
        const eff = (effectiveItems || []).find(e => e.line_id === l.id);
        return {
          ...l,
          volume: eff ? parseFloat(eff.volume) : l.volume,
          harga_satuan: eff ? parseFloat(eff.harga_satuan) : l.harga_satuan,
          jumlah: eff ? parseFloat(eff.jumlah) : l.jumlah,
        };
      });

      const catalog = {};
      const uniqueMasterIds = [...new Set((lines || []).map(l => l.master_ahsp_id).filter(Boolean))];

      if (uniqueMasterIds.length > 0) {
        const { data: catalogData } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', uniqueMasterIds);
        (catalogData || []).forEach(item => { catalog[item.master_ahsp_id] = item.details || []; });
      }

      const finalLines = processedLines.map(l => {
        if (!l.master_ahsp_id || !catalog[l.master_ahsp_id]) return { ...l, profit_percent: l.profit_percent ?? currentProjectObj?.overhead_percent ?? currentProjectObj?.profit_percent ?? 15 };
        const details = catalog[l.master_ahsp_id];
        let newBase = 0;
        details.forEach(d => {
          const p = overrideMap[d.kode_item]?.harga_satuan || d.harga_konversi || 0;
          newBase += (Number(d.koefisien || 0) * Number(p));
        });
        if (newBase === 0) return { ...l, profit_percent: l.profit_percent ?? currentProjectObj?.overhead_percent ?? currentProjectObj?.profit_percent ?? 15 };
        const profitPct = l.profit_percent !== null && l.profit_percent !== undefined ? Number(l.profit_percent) : (currentProjectObj?.overhead_percent ?? currentProjectObj?.profit_percent ?? 15);
        const newHarga = Math.round(newBase * (1 + (profitPct / 100)));
        const newJumlah = (Number(l.volume || 0) * newHarga);
        return { ...l, profit_percent: profitPct, harga_satuan: newHarga, jumlah: newJumlah };
      });

      const resources = (resourcesRes.data || []).map(r => ({
        ...r,
        jenis: r.jenis_komponen === 'tenaga' ? 'upah' : r.jenis_komponen,
        total_volume: Number(r.total_volume_terpakai || 0)
      }));

      return {
        data: {
          schedule: { lines: finalLines, resources: resources },
          ahsp: finalLines,
          harga: resources,
          backup: backup || [],
          catalog // Also return catalog for the UI to use if needed
        },
        error: null
      };
    }
    else if (tab === 'ahsp') {
      const { data: lines } = await supabase.from('ahsp_lines').select('*, master_ahsp(*)').eq('project_id', projectId).order('bab_pekerjaan');
      const uniqueMasterIds = [...new Set((lines || []).map(l => l.master_ahsp_id).filter(Boolean))];
      let finalLines = lines || [];
      if (uniqueMasterIds.length > 0) {
        const { data: catalogData } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', uniqueMasterIds);
        finalLines = (lines || []).map(l => {
          const details = catalogData?.find(c => c.master_ahsp_id === l.master_ahsp_id)?.details || [];
          if (details.length === 0) return l;
          let newBase = 0;
          details.forEach(d => {
            const p = overrideMap[d.kode_item]?.harga_satuan || d.harga_konversi || 0;
            newBase += (Number(d.koefisien || 0) * Number(p));
          });
          if (newBase === 0) return { ...l, profit_percent: l.profit_percent ?? currentProjectObj?.overhead_percent ?? currentProjectObj?.profit_percent ?? 15 };
          const profitPct = l.profit_percent !== null && l.profit_percent !== undefined ? Number(l.profit_percent) : (currentProjectObj?.overhead_percent ?? currentProjectObj?.profit_percent ?? 15);
          const newHarga = Math.round(newBase * (1 + (profitPct / 100)));
          return { ...l, profit_percent: profitPct, harga_satuan: newHarga, jumlah: (Number(l.volume || 0) * newHarga) };
        });
      }
      return { data: { ahsp: finalLines }, error: null };
    }
    else if (tab === 'terpakai') {
      const [ahspRes, resourceSumRes, overridesRes] = await Promise.all([
        supabase.from('ahsp_lines').select('*, master_ahsp(*)').eq('project_id', projectId).order('bab_pekerjaan'),
        supabase.from('view_project_resource_summary').select('*').eq('project_id', projectId),
        supabase.from('master_harga_custom').select('*')
      ]);

      const ahsp = ahspRes.data;
      const resourceSum = resourceSumRes.data;
      const overrides = overridesRes.data || [];
      const localOverrideMap = Object.fromEntries(overrides.map(o => [o.kode_item, o]));

      const aggregated = {};
      (resourceSum || []).forEach(r => {
        const k = r.key_item;
        const ov = localOverrideMap[k];

        if (!aggregated[k]) {
          aggregated[k] = { ...r };
          if (ov && ov.harga_satuan > 0) {
            aggregated[k].harga_snapshot = ov.harga_satuan;
            aggregated[k].tkdn_percent = ov.tkdn_percent;
            aggregated[k].source_table = 'master_harga_custom';
            aggregated[k].overrides_id = ov.id;
            aggregated[k].kontribusi_nilai = (parseFloat(r.total_volume_terpakai) || 0) * ov.harga_satuan;
            aggregated[k].nilai_tkdn = aggregated[k].kontribusi_nilai * (ov.tkdn_percent / 100);
          }
        }
        else {
          aggregated[k].total_volume_terpakai = (parseFloat(aggregated[k].total_volume_terpakai) || 0) + (parseFloat(r.total_volume_terpakai) || 0);
          if (ov && ov.harga_satuan > 0) {
            const newKontribusi = (parseFloat(r.total_volume_terpakai) || 0) * ov.harga_satuan;
            aggregated[k].kontribusi_nilai = (parseFloat(aggregated[k].kontribusi_nilai) || 0) + newKontribusi;
            aggregated[k].nilai_tkdn = (parseFloat(aggregated[k].nilai_tkdn) || 0) + (newKontribusi * (ov.tkdn_percent / 100));
          } else {
            aggregated[k].kontribusi_nilai = (parseFloat(aggregated[k].kontribusi_nilai) || 0) + (parseFloat(r.kontribusi_nilai) || 0);
            aggregated[k].nilai_tkdn = (parseFloat(aggregated[k].nilai_tkdn) || 0) + (parseFloat(r.nilai_tkdn) || 0);
          }
        }
      });

      const priorityMap = { upah: 1, bahan: 2, alat: 3 };
      const sortedHarga = Object.values(aggregated).sort((a, b) => {
        const pa = priorityMap[a.jenis_komponen?.toLowerCase()] || 99;
        const pb = priorityMap[b.jenis_komponen?.toLowerCase()] || 99;
        if (pa !== pb) return pa - pb;
        return (a.uraian || '').localeCompare(b.uraian || '');
      });

      return { data: { ahsp: ahsp || [], harga: sortedHarga }, error: null };
    }
    else if (tab === 'perubahan') {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      const [ccoRes, mcRes] = await Promise.all([
        supabase.from('project_cco')
          .select('*')
          .eq('project_id', projectId)
          .or(`status.eq.approved,created_by.eq.${userId}`)
          .order('cco_type', { ascending: true }),
        supabase.from('project_mc')
          .select('*')
          .eq('project_id', projectId)
          .eq('created_by', userId)
          .order('mc_type', { ascending: true })
      ]);
      return { data: { cco: ccoRes.data || [], mc: mcRes.data || [] }, error: null };
    }
    else if (tab === 'tkdn') {
      const { data: resSum } = await supabase.from('view_project_resource_summary').select('*').eq('project_id', projectId);
      let total_nilai = 0, total_tkdn_nilai = 0;
      const byJenis = { upah: { nilai: 0, tkdn: 0 }, bahan: { nilai: 0, tkdn: 0 }, alat: { nilai: 0, tkdn: 0 } };
      const list = (resSum || []).map(r => {
        const v_nilai = parseFloat(r.kontribusi_nilai) || 0;
        const v_tkdn_v = parseFloat(r.nilai_tkdn) || 0;
        const j = (r.jenis_komponen || r.jenis || '').toLowerCase();
        total_nilai += v_nilai; total_tkdn_nilai += v_tkdn_v;
        if (byJenis[j]) { byJenis[j].nilai += v_nilai; byJenis[j].tkdn += v_tkdn_v; }
        return { ...r, total_nilai: v_nilai, total_tkdn_nilai: v_tkdn_v, tkdn: parseFloat(r.tkdn_pct || r.tkdn || 0) };
      });
      const total_tkdn_pct = total_nilai > 0 ? (total_tkdn_nilai / total_nilai) * 100 : 0;
      return { data: { harga: list, tkdn: { total_nilai, total_tkdn_nilai, total_tkdn_pct, byJenis } }, error: null };
    }
    else if (tab === 'backup') {
      const [ahspRes, backupRes] = await Promise.all([
        supabase.from('ahsp_lines').select('*, master_ahsp(*)').eq('project_id', projectId).order('bab_pekerjaan'),
        supabase.from('project_backup_volume').select('*').eq('project_id', projectId)
      ]);
      return { data: { ahsp: ahspRes.data || [], backup: backupRes.data || [] }, error: null };
    }
    
    return { data: {}, error: null };
  } catch (error) {
    console.error('Error in getProjectTabData:', error);
    return { data: null, error };
  }
};
