import { create } from 'zustand';
import { fetchRabData, saveRabData } from '@/lib/services/rabService';
import useScheduleStore from './useScheduleStore';

/**
 * useRabStore
 * Handles RAB lines and AHSP catalog in a normalized shape.
 * { rabItems: { [id]: item } }
 */
const useRabStore = create((set, get) => ({
  rabItems: {}, // Normalized state: { [id]: { ...lineData } }
  ahspCatalog: {}, // Normalized: { [master_ahsp_id]: details }
  
  // Computed selector
  getSortedRabItems: () => {
    return Object.values(get().rabItems).sort((a, b) => a.sort_order - b.sort_order);
  },

  // Actions
  loadRabData: async (projectId) => {
    const { project, lines, masterPrices, masterDetails, error } = await fetchRabData(projectId);
    if (!error && lines) {
      const normalizedItems = {};
      lines.forEach(line => {
        normalizedItems[line.id] = line;
      });
      set({ 
        rabItems: normalizedItems,
        ahspCatalog: masterDetails || {}
      });
      useScheduleStore.getState().syncFromRab(normalizedItems);
    }
    return { project, lines, masterPrices, masterDetails, error };
  },

  setRabItems: (items) => {
    const normalized = {};
    items.forEach(item => {
      normalized[item.id || item.key] = item;
    });
    set({ rabItems: normalized });
    useScheduleStore.getState().syncFromRab(normalized);
  },

  updateRabItem: (id, updates) => {
    set((state) => ({
      rabItems: {
        ...state.rabItems,
        [id]: { ...state.rabItems[id], ...updates }
      }
    }));
    useScheduleStore.getState().syncFromRab(get().rabItems);
  },

  patchRabItems: (patches, source = 'local', sourceClientId = null) => {
    set((state) => {
      const nextItems = { ...state.rabItems };
      let hasChanges = false;
      
      const myClientId = typeof window !== 'undefined' ? require('@/lib/supabase').clientId : 'server';

      patches.forEach(patch => {
        const existing = nextItems[patch.id];
        if (existing) {
          if (source === 'remote' && sourceClientId === myClientId) return;
          if (source === 'remote' && patch.version && existing.version && patch.version <= existing.version) return;
          
          nextItems[patch.id] = { ...existing, ...patch };
          hasChanges = true;
        } else if (patch.id) {
          if (source === 'remote' && sourceClientId === myClientId) return;
          nextItems[patch.id] = patch;
          hasChanges = true;
        }
      });

      if (!hasChanges) return state;
      return { rabItems: nextItems };
    });
    
    // Sync schedule
    useScheduleStore.getState().syncFromRab(get().rabItems);
  },

  removeRabItem: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.rabItems;
      return { rabItems: rest };
    });
    useScheduleStore.getState().syncFromRab(get().rabItems);
  },

  saveLumpsumToMaster: async (item) => {
    const { saveLumpsumToMaster: serviceSaveLumpsum } = await import('@/lib/services/rabService');
    return await serviceSaveLumpsum(item);
  },

  saveRabData: async (projectId, identityPayload, allLines, deleteMissing = true) => {
    const { saveRabData: serviceSaveRab } = await import('@/lib/services/rabService');
    
    // Pembersihan Payload: Hapus ID yang bukan UUID v4 valid (seperti "temp-xxx")
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const cleanedLines = allLines.map(line => {
      if (line.id && !uuidRegex.test(String(line.id))) {
        const { id, ...rest } = line; // Buang properti 'id'
        return rest;
      }
      return line;
    });

    const result = await serviceSaveRab(projectId, identityPayload, cleanedLines, deleteMissing);
    return result;
  },

  clearRabStore: () => set({ rabItems: {}, ahspCatalog: {} }),
}));

export default useRabStore;
