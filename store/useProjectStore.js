import { create } from 'zustand';

/**
 * useProjectStore
 * Global state management for Zona Geometry projects using Zustand.
 * Follows the "Strangler Fig" pattern - currently only infrastructure, 
 * not yet integrated into the existing UI to ensure stability.
 */
const useProjectStore = create((set) => ({
  // --- STATE ---
  activeProject: null, // Stores current project metadata/identity
  rabData: [],         // Stores ahsp_lines (RAB items)
  masterData: {        // Catalog data for AHSP and basic prices
    ahsp: [],
    basicPrices: []
  },
  isLoading: false,    // Global loading indicator

  // --- ACTIONS ---
  
  // Project Actions
  setActiveProject: (project) => set({ activeProject: project }),
  
  clearProject: () => set({ 
    activeProject: null, 
    rabData: [], 
    isLoading: false 
  }),

  // RAB Data Actions
  setRabData: (data) => set({ rabData: data }),
  
  addRabItem: (item) => set((state) => ({ 
    rabData: [...state.rabData, item] 
  })),
  
  updateRabItem: (id, updates) => set((state) => ({
    rabData: state.rabData.map((item) => 
      item.id === id ? { ...item, ...updates } : item
    )
  })),
  
  removeRabItem: (id) => set((state) => ({
    rabData: state.rabData.filter((item) => item.id !== id)
  })),

  // Master Data Actions
  setMasterData: (data) => set((state) => ({
    masterData: { ...state.masterData, ...data }
  })),

  setAhspCatalog: (ahsp) => set((state) => ({
    masterData: { ...state.masterData, ahsp }
  })),

  setBasicPrices: (basicPrices) => set((state) => ({
    masterData: { ...state.masterData, basicPrices }
  })),

  // Status Actions
  setIsLoading: (status) => set({ isLoading: status }),
}));

export default useProjectStore;
