import { supabase } from '@/lib/supabase';

const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
  return isNaN(n) ? 0 : n;
};

/**
 * Service for handling RAB (Rencana Anggaran Biaya) data.
 * Fully restored to support Project Management, RAB, and Catalog operations.
 */

// --- PROJECT SERVICES ---

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

export const fetchUserProjects = async (userId, accessibleIds = []) => {
  try {
    let query = supabase.from('projects').select('*');
    
    if (accessibleIds && accessibleIds.length > 0) {
      query = query.or(`created_by.eq.${userId},id.in.(${accessibleIds.join(',')})`);
    } else {
      query = query.eq('created_by', userId);
    }
    
    const { data, error } = await query.order('updated_at', { ascending: false });
    return { data, error };
  } catch (error) {
    console.error('Error in fetchUserProjects:', error);
    return { data: null, error };
  }
};

export const fetchUserMembershipSlots = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('project_members')
      .select('*')
      .eq('user_id', userId);
    return { data, error };
  } catch (error) {
    console.error('Error in fetchUserMembershipSlots:', error);
    return { data: null, error };
  }
};

export const upsertProject = async (projectId, payload) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const cleanPayload = { ...payload };
    if (cleanPayload.hsp_value !== undefined) cleanPayload.hsp_value = parseNum(cleanPayload.hsp_value);
    if (cleanPayload.ppn_percent !== undefined) cleanPayload.ppn_percent = parseNum(cleanPayload.ppn_percent);
    if (cleanPayload.overhead_percent !== undefined) cleanPayload.overhead_percent = parseNum(cleanPayload.overhead_percent);
    
    cleanPayload.updated_at = new Date().toISOString();
    cleanPayload.updated_by = user.id;

    if (projectId && projectId !== 'new' && projectId !== 'null' && projectId !== 'undefined') {
      const { data, error } = await supabase
        .from('projects')
        .update(cleanPayload)
        .eq('id', projectId)
        .select()
        .maybeSingle();
      if (error) return { data: null, error };
      if (!data) return { data: null, error: new Error('Proyek tidak ditemukan atau akses ditolak.') };
      return { data, error: null };
    } else {
      cleanPayload.created_by = user.id;
      cleanPayload.user_id = user.id;
      const { data, error } = await supabase
        .from('projects')
        .insert(cleanPayload)
        .select()
        .maybeSingle();
      if (error) return { data: null, error };
      if (!data) return { data: null, error: new Error('Gagal membuat proyek baru.') };
      return { data, error: null };
    }
  } catch (error) {
    console.error('Error in upsertProject:', error);
    return { data: null, error };
  }
};

export const syncUserLocation = async (userId, locationId) => {
  try {
    const { error } = await supabase
      .from('members')
      .update({ selected_location_id: locationId })
      .eq('user_id', userId);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const deleteProject = async (projectId) => {
  try {
    // Due to cascading deletes or manual cleanup if needed
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const leaveProject = async (projectId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', user.id);
    return { error };
  } catch (error) {
    return { error };
  }
};

// --- RAB & AHSP SERVICES ---

export const fetchRabData = async (projectId) => {
  try {
    const [projRes, linesRes] = await Promise.all([
      fetchProjectById(projectId),
      supabase.from('ahsp_lines').select('*, master_ahsp(kode_ahsp)').eq('project_id', projectId).order('sort_order')
    ]);

    if (projRes.error) throw projRes.error;
    if (linesRes.error) throw linesRes.error;

    // Fetch master prices based on project location
    const locId = projRes.data?.location_id;
    let masterPrices = {};
    
    if (locId) {
      const { data: catalog } = await supabase
        .from('master_harga_dasar')
        .select('id, harga_satuan')
        .eq('location_id', locId);
      
      (catalog || []).forEach(c => {
        masterPrices[c.id] = c.harga_satuan;
      });
    }

    return { 
      project: projRes.data, 
      lines: linesRes.data, 
      masterPrices, 
      error: null 
    };
  } catch (error) {
    console.error('Error in fetchRabData:', error);
    return { project: null, lines: [], masterPrices: {}, error };
  }
};

export const saveRabData = async (projectId, identityPayload, allLines, deleteMissing = true) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Anda harus login untuk menyimpan data.');

    let currentProjectId = projectId;
    let savedProj = null;

    // 1. TAHAP PERTAMA: Pastikan Proyek (Induk) Ada atau Dibuat
    if (identityPayload) {
      const { data: projData, error: projErr } = await upsertProject(projectId, identityPayload);
      if (projErr) throw new Error(`Gagal menyimpan identitas proyek: ${projErr.message}`);
      if (!projData || !projData.id) throw new Error('Database gagal mengembalikan ID Proyek yang baru.');
      
      savedProj = projData;
      currentProjectId = projData.id; // Pastikan kita menggunakan ID dari database
    }

    if (!currentProjectId || currentProjectId === 'new') {
        throw new Error("Gagal mendapatkan ID Proyek yang valid dari database.");
    }

    // 2. TAHAP KEDUA: Bulk Upsert Line Items (Anak)
    if (allLines && allLines.length > 0) {
      const processedLines = allLines.map(l => {
        // Jangan sertakan ID sama sekali agar DB membuatkan UUID baru
        const payload = {
          project_id: currentProjectId,
          bab_pekerjaan: l.bab_pekerjaan || l.namaBab || 'UMUM',
          uraian: l.uraian,
          uraian_custom: l.uraian_custom || l.uraianCustom || null,
          satuan: l.satuan,
          volume: parseNum(l.volume),
          harga_satuan: parseNum(l.hargaSatuan || l.harga_satuan),
          jumlah: parseNum(l.volume) * parseNum(l.hargaSatuan || l.harga_satuan),
          profit_percent: parseNum(l.profitPercent || l.profit_percent),
          analisa_custom: l.analisaDetails || l.analisa_custom || [],
          sort_order: l.sort_order || 0,
          updated_by: user.id, // Wajib untuk lolos RLS
          master_ahsp_id: l.master_ahsp_id || l.masterAhspId || null
        };

        // HANYA pasang ID jika ini adalah data LAMA yang valid UUID-nya
        // Regex untuk mengecek format UUID v4 yang valid
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (l.id && uuidRegex.test(l.id)) {
          payload.id = l.id;
        }

        return payload;
      });

      // Lakukan Upsert
      const { data: upsertedData, error: upsertErr } = await supabase
        .from('ahsp_lines')
        .upsert(processedLines, { onConflict: 'id' })
        .select();
        
      if (upsertErr) throw new Error(`Gagal menyimpan baris RAB: ${upsertErr.message}`);

      // 3. TAHAP KETIGA: Hapus item yang dibuang user di UI
      if (deleteMissing && upsertedData && upsertedData.length > 0) {
        const keptIds = upsertedData.map(l => l.id).filter(Boolean);
        if (keptIds.length > 0) {
          const { error: delErr } = await supabase
            .from('ahsp_lines')
            .delete()
            .eq('project_id', currentProjectId)
            .not('id', 'in', `(${keptIds.join(',')})`);
          if (delErr) console.warn("Delete Missing Items Error:", delErr);
        }
      }

      return { projectId: currentProjectId, lines: upsertedData, error: null };
    }

    return { projectId: currentProjectId, lines: [], error: null };
  } catch (error) {
    console.error('Critical Error in saveRabData:', error);
    return { error };
  }
};

// --- CATALOG & SEARCH SERVICES ---

export const searchAhspCatalog = async (query) => {
  try {
    const { data, error } = await supabase
      .from('view_katalog_ahsp_lengkap')
      .select('*')
      .or(`nama_pekerjaan.ilike.%${query}%,kode_ahsp.ilike.%${query}%`)
      .limit(20);
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

export const searchLumpsumItems = async (query) => {
  try {
    const { data, error } = await supabase
      .from('master_harga_custom')
      .select('*')
      .eq('kategori_item', 'Lumpsum')
      .ilike('nama_item', `%${query}%`)
      .limit(20);
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

export const getMaxLumpsumSuffix = async () => {
  try {
    const { data, error } = await supabase
      .from('master_harga_custom')
      .select('kode_item')
      .eq('kategori_item', 'Lumpsum')
      .order('kode_item', { ascending: false })
      .limit(1);
    
    if (data?.[0]?.kode_item) {
      const match = data[0].kode_item.match(/\d+$/);
      return { max: match ? parseInt(match[0]) : 0 };
    }
    return { max: 0 };
  } catch (error) {
    return { max: 0, error };
  }
};

export const saveLumpsumToMaster = async (item) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { max } = await getMaxLumpsumSuffix();
    const nextCode = `LS.${String(max + 1).padStart(3, '0')}`;
    
    const { error } = await supabase.from('master_harga_custom').insert({
      user_id: user.id,
      kategori_item: 'Lumpsum',
      kode_item: nextCode,
      nama_item: item.uraian,
      satuan: item.satuan,
      harga_satuan: parseNum(item.hargaSatuan)
    });
    
    return { nextCode, error };
  } catch (error) {
    return { error };
  }
};

// --- MEMBER & COLLABORATION SERVICES ---

export const joinProjectByCode = async (userId, joinCode) => {
  try {
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .select('id, name')
      .eq('unique_code', joinCode)
      .maybeSingle();
    if (projErr) throw projErr;
    if (!proj) throw new Error('Kode proyek tidak valid atau proyek tidak ditemukan.');

    const { error: joinErr } = await supabase
      .from('project_members')
      .insert({ project_id: proj.id, user_id: userId });
    
    if (joinErr) {
      if (joinErr.code === '23505') throw new Error('Anda sudah bergabung di proyek ini.');
      throw joinErr;
    }
    return { data: proj, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const assignProjectSlot = async (projectId, userId, slotRole) => {
  try {
    const { error } = await supabase
      .from('project_members')
      .update({ slot_role: slotRole })
      .eq('project_id', projectId)
      .eq('user_id', userId);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const resetProjectSlot = async (projectId, slotRole) => {
  try {
    const { error } = await supabase
      .from('project_members')
      .update({ slot_role: null })
      .eq('project_id', projectId)
      .eq('slot_role', slotRole);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const removeProjectMember = async (projectId, userId) => {
  try {
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const fetchProjectMembers = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('project_members')
      .select('*, members(full_name, email)')
      .eq('project_id', projectId);
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

// --- MISC SERVICES ---

export const fetchLocations = async () => {
  try {
    const { data, error } = await supabase.from('locations').select('*').order('name');
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

export const fetchMemberInfo = async (userId) => {
  try {
    const { data, error } = await supabase.from('members').select('*').eq('user_id', userId).maybeSingle();
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

export const updateProjectStartDate = async (projectId, startDate) => {
  try {
    const { error } = await supabase
      .from('projects')
      .update({ start_date: startDate })
      .eq('id', projectId);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const updateLineStartDate = async (lineId, startDate) => {
  try {
    const { error } = await supabase
      .from('ahsp_lines')
      .update({ start_date: startDate })
      .eq('id', lineId);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const updateLineResource = async (lineId, field, value) => {
  try {
    const { error } = await supabase
      .from('ahsp_lines')
      .update({ [field]: value })
      .eq('id', lineId);
    return { error };
  } catch (error) {
    return { error };
  }
};

export const handleUpdateLineStatus = async (lineId, status) => {
  try {
    const { error } = await supabase
      .from('ahsp_lines')
      .update({ status_approval: status })
      .eq('id', lineId);
    return { error };
  } catch (error) {
    return { error };
  }
};
