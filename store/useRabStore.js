import { create } from 'zustand';
import { fetchRabData, saveRabData } from '@/lib/services/rabService';

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
    }
    return { project, lines, masterPrices, error };
  },

  setRabItems: (items) => {
    const normalized = {};
    items.forEach(item => {
      normalized[item.id || item.key] = item;
    });
    set({ rabItems: normalized });
  },

  updateRabItem: (id, updates) => set((state) => ({
    rabItems: {
      ...state.rabItems,
      [id]: { ...state.rabItems[id], ...updates }
    }
  })),

  patchRabItems: (patches) => set((state) => {
    const nextItems = { ...state.rabItems };
    patches.forEach(patch => {
      if (patch.id && nextItems[patch.id]) {
        // Only patch if version is newer or equal (simple conflict check)
        if (!patch.version || !nextItems[patch.id].version || patch.version >= nextItems[patch.id].version) {
          nextItems[patch.id] = { ...nextItems[patch.id], ...patch };
        }
      } else if (patch.id) {
        nextItems[patch.id] = patch;
      }
    });
    return { rabItems: nextItems };
  }),

  removeRabItem: (id) => set((state) => {
    const { [id]: _, ...rest } = state.rabItems;
    return { rabItems: rest };
  }),

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
