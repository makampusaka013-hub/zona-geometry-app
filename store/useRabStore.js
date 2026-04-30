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
    const { project, lines, masterPrices, error } = await fetchRabData(projectId);
    if (!error && lines) {
      const normalizedItems = {};
      lines.forEach(line => {
        normalizedItems[line.id] = line;
      });
      set({ rabItems: normalizedItems });
      useScheduleStore.getState().syncFromRab(normalizedItems);
    }
    return { project, lines, masterPrices, error };
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
    const result = await serviceSaveRab(projectId, identityPayload, allLines, deleteMissing);
    if (!result.error) {
      // After save, we might want to refresh the local store or let the component do it
      // For now, let's just return the result
    }
    return result;
  },

  clearRabStore: () => set({ rabItems: {}, ahspCatalog: {} }),
}));

export default useRabStore;
