import { supabase } from '@/lib/supabase';

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
