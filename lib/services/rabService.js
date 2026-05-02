import { supabase } from '@/lib/supabase';
import { canEditProject } from '../rbac';
import { ProjectIdentitySchema, RabLinesSchema } from '../validations/rabSchema';

const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
  return isNaN(n) ? 0 : n;
};

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
    const { data: { user } } = await supabase.auth.getUser();
    const updatedPayload = { ...payload, updated_by: user?.id, updated_at: new Date().toISOString() };

    // Validate payload before saving
    const validation = ProjectIdentitySchema.safeParse(updatedPayload);
    if (!validation.success) {
      const errorMsg = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return { data: null, error: new Error(`Validasi Gagal: ${errorMsg}`) };
    }

    // Jika ada ID, coba Update dulu, jika gagal (data tidak ada), lakukan Insert
    if (projectId && projectId !== 'new' && projectId !== 'null' && projectId !== 'undefined') {
      const currentVersion = payload.version || 1;
      
      // Update: Biarkan Database Trigger yang menaikkan versi
      let query = supabase
        .from('projects')
        .update(updatedPayload)
        .eq('id', projectId);
      
      if (currentVersion === 1) {
        query = query.or(`version.eq.1,version.is.null`);
      } else {
        query = query.eq('version', currentVersion);
      }

      const { data: updateData, error: updateErr } = await query.select().maybeSingle();

      // FALLBACK: Jika update tidak menghasilkan data (bisa karena konflik versi atau ID tidak ada)
      if (!updateData) {
        const { data: exists } = await supabase.from('projects').select('version').eq('id', projectId).maybeSingle();
        
        if (exists) {
          throw new Error(`Konflik Data: Proyek telah diupdate oleh user lain. (Lokal: ${currentVersion}, DB: ${exists.version || '1'}). Silakan Refresh.`);
        }

        // Data benar-benar TIDAK ADA -> Baru boleh Insert
        const { data: insertData, error: insertErr } = await supabase
          .from('projects')
          .insert({ 
            ...updatedPayload, 
            id: projectId, 
            version: 1,
            start_date: updatedPayload.start_date || new Date().toISOString().split('T')[0]
          })
          .select()
          .single();
        
        if (insertErr) throw insertErr;
        return { data: insertData, error: null };
      }

      if (updateErr) throw updateErr;
      return { data: updateData, error: null };
    } else {
      // Murni Insert untuk proyek baru
      const { data, error } = await supabase
        .from('projects')
        .insert({ 
          ...updatedPayload, 
          version: 1,
          start_date: updatedPayload.start_date || new Date().toISOString().split('T')[0]
        })
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

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Persiapkan data untuk Bulk Upsert
    const processedItems = items.map(it => ({
      ...it,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      // Biarkan DB Trigger yang menangani kenaikan versi dan snapshot
    }));

    // Gunakan Bulk Upsert untuk efisiensi tinggi
    const { data, error } = await supabase
      .from('ahsp_lines')
      .upsert(processedItems, { onConflict: 'id' })
      .select();

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error in upsertRabItems (Bulk):', error);
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
    return { data: null, error: 'Tab tidak ditemukan' };
  } catch (error) {
    console.error('Error in getProjectTabData:', error);
    return { data: null, error };
  }
};

/**
 * Fetch detailed user member info including RBAC roles.
 * @param {string} userId 
 */
export const fetchMemberInfo = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('user_id, full_name, role, expired_at, is_paid, selected_location_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    let isExpired = false;
    if (data?.expired_at && new Date(data.expired_at) < new Date()) {
      isExpired = true;
    }

    return {
      data: data ? { ...data, isExpired, approval_status: 'approved' } : { user_id: userId, role: 'normal', isExpired: false, approval_status: 'pending' },
      error: null
    };
  } catch (error) {
    console.error('Error in fetchMemberInfo:', error);
    return { data: null, error };
  }
};

/**
 * Fetch all projects accessible by the user (owned or joined).
 * @param {string} userId 
 * @param {Array} accessibleIds - IDs of projects joined as a member.
 */
export const fetchUserProjects = async (userId, accessibleIds = []) => {
  try {
    const { data: proj, error } = await supabase.from('projects')
      .select('*, ahsp_lines(jumlah)')
      .or(`created_by.eq.${userId},id.in.(${accessibleIds.length > 0 ? accessibleIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const loadedProjects = proj || [];

    // Fetch progress realization days for these projects
    if (loadedProjects.length > 0) {
      const pIds = loadedProjects.map(p => p.id);
      const { data: progData } = await supabase.from('project_progress_daily')
        .select('project_id, day_number')
        .in('project_id', pIds);

      const progMap = {};
      if (progData) {
        progData.forEach(p => {
          const dNum = Number(p.day_number) || 0;
          if (dNum > (progMap[p.project_id] || 0)) {
            progMap[p.project_id] = dNum;
          }
        });
      }

      loadedProjects.forEach(p => {
        p.realization_days = progMap[p.id] || 0;
      });
    }

    return { data: loadedProjects, error: null };
  } catch (error) {
    console.error('Error in fetchUserProjects:', error);
    return { data: null, error };
  }
};

/**
 * Fetch project members and user's role in a specific project.
 * @param {string} projectId 
 */
export const fetchProjectMembers = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('project_members')
      .select('*, members!project_members_user_id_fkey(full_name, email)')
      .eq('project_id', projectId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in fetchProjectMembers:', error);
    return { data: null, error };
  }
};

/**
 * Fetch all project membership slots for a user.
 * @param {string} userId 
 */
export const fetchUserMembershipSlots = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('project_members')
      .select('project_id, slot_role')
      .eq('user_id', userId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error in fetchUserMembershipSlots:', error);
    return { data: null, error };
  }
};

/**
 * Sync user's selected location context.
 */
export const syncUserLocation = async (userId, locationId) => {
  try {
    const { error } = await supabase.from('members')
      .update({ selected_location_id: locationId })
      .eq('user_id', userId);
    return { error };
  } catch (error) {
    console.error('Error in syncUserLocation:', error);
    return { error };
  }
};

/**
 * Assign a member to a specific project slot role.
 */
export const assignProjectSlot = async (projectId, userId, slotRole) => {
  try {
    const { data, error } = await supabase.rpc('assign_project_slot', {
      p_project_id: projectId,
      p_user_id: userId,
      p_slot_role: slotRole
    });
    return { data, error };
  } catch (error) {
    console.error('Error in assignProjectSlot:', error);
    return { data: null, error };
  }
};

/**
 * Reset a project slot role.
 */
export const resetProjectSlot = async (projectId, slotRole) => {
  try {
    const { data, error } = await supabase.rpc('reset_project_slot', {
      p_project_id: projectId,
      p_slot_role: slotRole
    });
    return { data, error };
  } catch (error) {
    console.error('Error in resetProjectSlot:', error);
    return { data: null, error };
  }
};

/**
 * Remove a member from a project.
 */
export const removeProjectMember = async (projectId, userId) => {
  try {
    const { data, error } = await supabase.rpc('remove_project_member', {
      p_project_id: projectId,
      p_user_id: userId
    });
    return { data, error };
  } catch (error) {
    console.error('Error in removeProjectMember:', error);
    return { data: null, error };
  }
};

/**
 * Update the approval status of a single RAB line.
 */
export const updateLineApprovalStatus = async (lineId, status) => {
  try {
    let rpcName = '';
    if (status === 'verified') rpcName = 'set_line_verified';
    else if (status === 'draft') rpcName = 'set_line_draft';
    else if (status === 'final') rpcName = 'set_line_final';

    if (!rpcName) throw new Error('Status tidak valid');

    const { data, error } = await supabase.rpc(rpcName, { p_line_id: lineId });
    return { data, error };
  } catch (error) {
    console.error('Error in updateLineApprovalStatus:', error);
    return { data: null, error };
  }
};

/**
 * Leave a project.
 */
export const leaveProject = async (projectId) => {
  try {
    const { data, error } = await supabase.rpc('leave_project', { p_project_id: projectId });
    return { data, error };
  } catch (error) {
    console.error('Error in leaveProject:', error);
    return { data: null, error };
  }
};

/**
 * Delete a project.
 */
export const deleteProject = async (projectId) => {
  try {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    return { error };
  } catch (error) {
    console.error('Error in deleteProject:', error);
    return { error };
  }
};

/**
 * Join a project using a unique code.
 */
export const joinProjectByCode = async (userId, joinCode) => {
  try {
    // 1. Find project by code
    const { data: p, error: pErr } = await supabase
      .from('projects')
      .select('id, name')
      .eq('unique_code', joinCode.toUpperCase())
      .maybeSingle();

    if (pErr) throw pErr;
    if (!p) return { error: new Error('Kode proyek tidak valid.') };

    // 2. Check if already a member
    const { data: existing } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', p.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) return { error: new Error('Anda sudah tergabung dalam proyek ini.') };

    // 3. Check capacity (limit 3)
    const { count } = await supabase
      .from('project_members')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p.id);

    if (count >= 3) return { error: new Error('Proyek ini sudah penuh (Batas 3 User).') };

    // 4. Insert membership
    const { error: insErr } = await supabase
      .from('project_members')
      .insert({
        project_id: p.id,
        user_id: userId,
        role: 'view'
      });

    if (insErr) throw insErr;

    return { data: p, error: null };
  } catch (error) {
    console.error('Error in joinProjectByCode:', error);
    return { error };
  }
};

/**
 * Update project-wide start date.
 */
export const updateProjectStartDate = async (projectId, startDate) => {
  try {
    const { error } = await supabase.from('projects').update({ start_date: startDate }).eq('id', projectId);
    return { error };
  } catch (error) {
    console.error('Error in updateProjectStartDate:', error);
    return { error };
  }
};

/**
 * Update a specific RAB line's start date.
 */
export const updateLineStartDate = async (lineId, startDate) => {
  try {
    const { error } = await supabase.from('ahsp_lines').update({ start_date: startDate }).eq('id', lineId);
    return { error };
  } catch (error) {
    console.error('Error in updateLineStartDate:', error);
    return { error };
  }
};

/**
 * Update resource allocation for a line item (workers or duration).
 */
export const updateLineResource = async (lineId, field, value) => {
  try {
    const { error } = await supabase.from('ahsp_lines').update({ [field]: value }).eq('id', lineId);
    return { error };
  } catch (error) {
    console.error('Error in updateLineResource:', error);
    return { error };
  }
};

/**
 * Search AHSP catalog using query.
 */
export const searchAhspCatalog = async (query) => {
  try {
    const { data, error } = await supabase
      .from('view_analisa_ahsp')
      .select('*')
      .or(`kode_ahsp.ilike.%${query.trim()}%,nama_pekerjaan.ilike.%${query.trim()}%`)
      .order('kode_ahsp')
      .limit(20);
    return { data, error };
  } catch (error) {
    console.error('Error in searchAhspCatalog:', error);
    return { data: null, error };
  }
};

/**
 * Search Lumpsum items using query.
 */
export const searchLumpsumItems = async (query) => {
  try {
    const searchPattern = `%${query.trim().replace(/\s+/g, '%')}%`;
    const { data, error } = await supabase.from('view_master_harga_gabungan')
      .select('*')
      .eq('kategori_item', 'Lumpsum')
      .ilike('nama_item', searchPattern)
      .limit(15);
    return { data, error };
  } catch (error) {
    console.error('Error in searchLumpsumItems:', error);
    return { data: null, error };
  }
};

/**
 * Get maximum Lumpsum code suffix.
 */
export const getMaxLumpsumSuffix = async () => {
  try {
    const { data, error } = await supabase.from('master_harga_custom').select('kode_item').ilike('kode_item', 'LS.%');
    if (error) throw error;
    let max = 0;
    (data || []).forEach(item => {
      const match = item.kode_item.match(/\.(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    });
    return { max, error: null };
  } catch (error) {
    console.error('Error in getMaxLumpsumSuffix:', error);
    return { max: 0, error };
  }
};

/**
 * Fetch detailed RAB data for editing.
 */
export const fetchRabData = async (projectId) => {
  try {
    // 1. Fetch Project Identity
    const { data: proj, error: projErr } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
    if (projErr) throw projErr;

    // 2. Fetch RAB Lines
    const { data: lines, error: lineErr } = await supabase
      .from('ahsp_lines')
      .select('*, master_ahsp(kode_ahsp)')
      .eq('project_id', projectId)
      .order('sort_order');
    if (lineErr) throw lineErr;

    // 3. Fetch Master Prices and Details (Trust the View's total_subtotal)
    const ahspIds = [...new Set((lines || []).filter(i => i.master_ahsp_id).map(i => i.master_ahsp_id))];
    let masterPrices = {};
    let masterDetails = {};
    if (ahspIds.length > 0) {
      const { data: masters, error: mastersErr } = await supabase
        .from('view_katalog_ahsp_lengkap')
        .select('master_ahsp_id, total_subtotal, details')
        .in('master_ahsp_id', ahspIds);
      
      if (mastersErr) throw mastersErr;

      (masters || []).forEach(m => {
        masterPrices[m.master_ahsp_id] = m.total_subtotal;
        masterDetails[m.master_ahsp_id] = m.details;
      });
    }

    // 4. Aggregate Resources (for Data Terpakai & TKDN Tabs)
    const resourceMap = {};
    const { data: overrides } = await supabase.from('master_harga_custom').select('*');
    const overrideMap = Object.fromEntries((overrides || []).map(o => [o.kode_item, o]));

    const tkdnSummary = {
      total_nilai: 0,
      total_tkdn_nilai: 0,
      total_tkdn_pct: 0,
      byJenis: {
        upah: { nilai: 0, tkdn: 0 },
        tenaga: { nilai: 0, tkdn: 0 },
        bahan: { nilai: 0, tkdn: 0 },
        alat: { nilai: 0, tkdn: 0 }
      }
    };

    (lines || []).forEach(line => {
      const details = line.analisa_custom?.length > 0 ? line.analisa_custom : (masterDetails[line.master_ahsp_id] || []);
      const lineVol = Number(line.volume || 0);

      details.forEach(det => {
        const kode = det.kode_item || det.kode || det.uraian;
        if (!kode) return;

        if (!resourceMap[kode]) {
          const ov = overrideMap[kode];
          const rawJ = (det.jenis_komponen || '').toLowerCase();
          const j = (rawJ === 'upah' || rawJ === 'tenaga') ? 'tenaga' : (rawJ === 'alat' ? 'alat' : 'bahan');
          
          resourceMap[kode] = {
            project_id: projectId,
            uraian: det.uraian || det.nama_item,
            key_item: kode,
            kode_item: kode, // Duplicate for compatibility
            satuan: det.satuan,
            jenis_komponen: j,
            harga_snapshot: ov ? ov.harga_satuan : (det.harga_konversi || det.harga || 0),
            tkdn: ov ? ov.tkdn_percent : (det.tkdn || 0),
            tkdn_percent: ov ? ov.tkdn_percent : (det.tkdn || 0), // Compatibility alias
            total_volume_terpakai: 0,
            total_nilai: 0,
            kontribusi_nilai: 0, // Compatibility alias
            total_tkdn_nilai: 0,
            source_table: ov ? 'master_harga_custom' : 'master_harga_dasar',
            overrides_id: ov ? ov.id : null
          };
        }

        const res = resourceMap[kode];
        const itemVol = lineVol * Number(det.koefisien || 0);
        const itemNilai = itemVol * res.harga_snapshot;
        const itemTkdnNilai = itemNilai * (res.tkdn / 100);

        res.total_volume_terpakai += itemVol;
        res.total_nilai += itemNilai;
        res.kontribusi_nilai += itemNilai; // Sync alias
        res.total_tkdn_nilai += itemTkdnNilai;

        // Update Summary
        tkdnSummary.total_nilai += itemNilai;
        tkdnSummary.total_tkdn_nilai += itemTkdnNilai;
        
        const cat = res.jenis_komponen;
        if (tkdnSummary.byJenis[cat]) {
          tkdnSummary.byJenis[cat].nilai += itemNilai;
          tkdnSummary.byJenis[cat].tkdn += itemTkdnNilai;
        }
      });
    });

    tkdnSummary.total_tkdn_pct = tkdnSummary.total_nilai > 0 ? (tkdnSummary.total_tkdn_nilai / tkdnSummary.total_nilai) * 100 : 0;
    const resources = Object.values(resourceMap);

    // Flatten lines to include kode_ahsp for UI ease
    const processedLines = (lines || []).map(line => ({
      ...line,
      master_ahsp_kode: line.master_ahsp?.kode_ahsp || line.kode_ahsp
    }));

    return { 
      project: proj, 
      lines: processedLines, 
      masterPrices, 
      masterDetails, 
      resources,
      tkdnSummary,
      error: null 
    };
  } catch (error) {
    console.error('Error in fetchRabData:', error);
    return { error };
  }
};

/**
 * Save RAB data (Atomic Transaction-like).
 */
export const saveRabData = async (projectId, identityPayload, allLines, deleteMissing = true) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Anda harus login untuk menyimpan data.');

    let currentProjectId = projectId;
    let savedProj = null;

    // TAHAP 1: Kelola Proyek Induk
    if (identityPayload) {
      // Pastikan payload membawa identitas user untuk lolos RLS
      const projPayload = {
        ...identityPayload,
        created_by: user.id,
        user_id: user.id
      };
      
      const { data: projData, error: projErr } = await upsertProject(projectId, projPayload);
      if (projErr) throw new Error(`Gagal menyimpan identitas proyek: ${projErr.message}`);
      if (!projData || !projData.id) throw new Error('Fatal: Database gagal mengembalikan ID Proyek yang sah.');
      
      savedProj = projData;
      currentProjectId = projData.id;
    }

    // Penjaga Gerbang: Jangan lanjut jika tidak ada ID Proyek yang valid
    if (!currentProjectId || currentProjectId === 'new' || currentProjectId === 'null') {
        throw new Error("Penyimpanan dibatalkan: ID Proyek Induk tidak valid.");
    }

    // TAHAP 2: Kelola Baris RAB
    if (allLines && allLines.length > 0) {
      const processedLines = allLines.map(l => {
        return {
          ...l,
          project_id: currentProjectId,
          updated_by: user.id
        };
      });

      const { data: upsertedData, error: upsertErr } = await supabase
        .from('ahsp_lines')
        .upsert(processedLines, { onConflict: 'id' })
        .select();
        
      if (upsertErr) throw new Error(`Gagal menyimpan baris RAB: ${upsertErr.message}`);

      // TAHAP 3: Hapus data usang
      if (deleteMissing && upsertedData && upsertedData.length > 0) {
        const keptIds = upsertedData.map(l => l.id).filter(Boolean);
        if (keptIds.length > 0) {
          const { error: delErr } = await supabase
            .from('ahsp_lines')
            .delete()
            .eq('project_id', currentProjectId)
            .not('id', 'in', `(${keptIds.join(',')})`);
          if (delErr) console.warn("Gagal menghapus baris lama:", delErr);
        }
      }

      return { projectId: currentProjectId, lines: upsertedData, project: savedProj, error: null };
    }

    return { projectId: currentProjectId, lines: [], project: savedProj, error: null };
  } catch (error) {
    console.error('Critical Error in saveRabData:', error);
    return { error };
  }
};

/**
 * Save a single Lumpsum item to master catalog.
 */
export const saveLumpsumToMaster = async (item) => {
  try {
    const { max } = await getMaxLumpsumSuffix();
    const nextCode = `LS.${String(max + 1).padStart(3, '0')}`;

    const { error } = await supabase.from('master_harga_custom').insert({
      nama_item: item.uraian,
      satuan: item.satuan,
      harga_satuan: item.hargaSatuan,
      kategori_item: 'Lumpsum',
      kode_item: nextCode,
      tkdn_percent: 0
    });
    return { nextCode, error };
  } catch (error) {
    console.error('Error in saveLumpsumToMaster:', error);
    return { error };
  }
};

/**
 * Fetch progress daily for export.
 */
export const fetchProjectProgress = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('project_progress_daily')
      .select('*')
      .eq('project_id', projectId);
    return { data, error };
  } catch (error) {
    console.error('Error in fetchProjectProgress:', error);
    return { data: null, error };
  }
};

/**
 * Fetch a daily report record for a specific date.
 */
export const fetchDailyReport = async (projectId, date) => {
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .eq('report_date', date)
      .maybeSingle();
    return { data, error };
  } catch (error) {
    console.error('Error in fetchDailyReport:', error);
    return { data: null, error };
  }
};

/**
 * Save or update a daily report record.
 */
export const upsertDailyReport = async (payload) => {
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .upsert(payload, { onConflict: 'project_id,report_date' })
      .select()
      .single();
    return { data, error };
  } catch (error) {
    console.error('Error in upsertDailyReport:', error);
    return { data: null, error };
  }
};

/**
 * Fetch project resource summary (pricing snapshots).
 */
export const fetchProjectResourceSummary = async (projectId, locationId) => {
  try {
    const [projectRes, catalogRes, overrideRes] = await Promise.all([
      supabase.from('view_project_resource_summary').select('kode_item:key_item, harga_satuan:harga_snapshot').eq('project_id', projectId),
      supabase.from('master_harga_dasar').select('kode_item, harga_satuan').eq('location_id', locationId),
      supabase.from('master_harga_custom').select('kode_item, harga_satuan')
    ]);

    return {
      projectResources: projectRes.data || [],
      catalogResources: catalogRes.data || [],
      overrideResources: overrideRes.data || [],
      error: projectRes.error || catalogRes.error || overrideRes.error
    };
  } catch (error) {
    console.error('Error in fetchProjectResourceSummary:', error);
    return { error };
  }
};

/**
 * Fetch AHSP details in bulk.
 */
export const fetchAhspDetailsInBulk = async (ahspIds) => {
  try {
    const { data, error } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', ahspIds);
    return { data, error };
  } catch (error) {
    console.error('Error in fetchAhspDetailsInBulk:', error);
    return { data: null, error };
  }
};

/**
 * Fetch all AHSP catalog items.
 */
export const fetchAllAhspCatalog = async () => {
  try {
    const { data, error } = await supabase
      .from('view_katalog_ahsp_lengkap')
      .select('*')
      .order('kode_ahsp');
    return { data, error };
  } catch (error) {
    console.error('Error in fetchAllAhspCatalog:', error);
    return { data: null, error };
  }
};

/**
 * Fetch regional prices for a location.
 */
export const fetchRegionalPrices = async (locationId) => {
  try {
    const [pricesRes, overrideRes] = await Promise.all([
      supabase.from('master_harga_dasar').select('kode_item, harga_satuan').eq('location_id', locationId),
      supabase.from('master_harga_custom').select('kode_item, harga_satuan')
    ]);
    return {
      regionalPrices: pricesRes.data || [],
      overridePrices: overrideRes.data || [],
      error: pricesRes.error || overrideRes.error
    };
  } catch (error) {
    console.error('Error in fetchRegionalPrices:', error);
    return { error };
  }
};

/**
 * Fetch regional catalog with item details.
 */
export const fetchRegionalCatalog = async (locationId) => {
  try {
    const [catalogRes, overrideRes] = await Promise.all([
      supabase.from('master_harga_dasar').select('*, master_items(*)').eq('location_id', locationId),
      supabase.from('master_harga_custom').select('kode_item, harga_satuan, tkdn_percent')
    ]);
    return {
      catalogData: catalogRes.data || [],
      overrideData: overrideRes.data || [],
      error: catalogRes.error || overrideRes.error
    };
  } catch (error) {
    console.error('Error in fetchRegionalCatalog:', error);
    return { error };
  }
};
