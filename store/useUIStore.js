import { create } from 'zustand';

/**
 * useUIStore
 * Handles UI state like tabs, modals, loading states, and theme.
 */
const useUIStore = create((set) => ({
  activeTab: 'proyek',
  tabLoading: false,
  tabVersion: 0,
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTabLoading: (status) => set({ tabLoading: status }),
  incrementTabVersion: () => set((state) => ({ tabVersion: state.tabVersion + 1 })),
  
  // Modals state
  modals: {
    confirm: { open: false, title: '', message: '', onConfirm: null },
    steelCalculation: { open: false, data: null },
    conversion: { open: false, data: null },
  },
  
  openConfirmModal: (title, message, onConfirm) => set((state) => ({
    modals: { ...state.modals, confirm: { open: true, title, message, onConfirm } }
  })),
  
  closeConfirmModal: () => set((state) => ({
    modals: { ...state.modals, confirm: { ...state.modals.confirm, open: false } }
  })),
}));

export default useUIStore;
