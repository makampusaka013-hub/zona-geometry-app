import { create } from 'zustand';
import { getProjectTabData } from '@/lib/services/rabService';

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
  tabData: {           // Data for project tabs (AHSP, Harga, Schedule, etc.)
    ahsp: [], 
    harga: [], 
    tkdn: null, 
    dok: [],
    schedule: { lines: [], resources: [] },
    cco: [], 
    mc: [],
    backup: [],
  },
  ahspCatalog: {},      // Detailed AHSP details for manpower calculations
  tabLoading: false,   // Loading indicator for tab data
  tabVersion: 0,       // Version counter to prevent race conditions during tab switching

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

  // Tab Data Actions
  setTabData: (data) => set((state) => ({ 
    tabData: typeof data === 'function' ? data(state.tabData) : { ...state.tabData, ...data } 
  })),

  setTabLoading: (status) => set({ tabLoading: status }),

  fetchTabData: async (tab, projectId, currentProjectObj = null) => {
    if (!projectId) {
      set({ 
        tabData: { ahsp: [], harga: [], tkdn: null, dok: [], schedule: { lines: [], resources: [] }, cco: [], mc: [] },
        tabLoading: false 
      });
      return;
    }

    const { tabVersion, tabData } = useProjectStore.getState();
    const nextVersion = tabVersion + 1;
    set({ tabVersion: nextVersion });

    // SWR-style loading: only show spinner if we have no data yet for this specific tab data
    const hasData = (() => {
      switch (tab) {
        case 'proyek': case 'progress': case 'schedule': case 'export': return tabData.ahsp?.length > 0;
        case 'terpakai': return tabData.harga?.length > 0;
        case 'perubahan': return tabData.cco?.length > 0 || tabData.mc?.length > 0;
        case 'tkdn': return tabData.tkdn !== null;
        case 'dok': return tabData.dok?.length > 0;
        case 'backup': return tabData.backup?.length > 0 || tabData.ahsp?.length > 0;
        default: return false;
      }
    })();

    if (!hasData) {
      set({ tabLoading: true });
    }

    try {
      const { data, error } = await getProjectTabData(tab, projectId, currentProjectObj);
      
      // Ensure we only update if this is still the latest request
      if (useProjectStore.getState().tabVersion === nextVersion) {
        if (error) throw error;
        
        const { catalog, ...restData } = data || {};
        
        set((state) => ({
          tabData: { ...state.tabData, ...restData },
          ahspCatalog: catalog ? { ...state.ahspCatalog, ...catalog } : state.ahspCatalog,
          tabLoading: false
        }));
      }
    } catch (error) {
      console.error('Error in fetchTabData store action:', error);
      if (useProjectStore.getState().tabVersion === nextVersion) {
        set({ tabLoading: false });
      }
    }
  },
}));

export default useProjectStore;
