import { create } from 'zustand';

/**
 * useScheduleStore
 * Handles project schedule, progress, and resource aggregation.
 */
const useScheduleStore = create((set, get) => ({
  scheduleLines: [],
  resources: [],
  dailyProgress: {}, // { [day]: { [entity_id]: value } }
  
  setScheduleLines: (lines) => set({ scheduleLines: lines }),
  setResources: (resources) => set({ resources: resources }),
  
  setDailyProgress: (day, progressMap) => set((state) => ({
    dailyProgress: { ...state.dailyProgress, [day]: progressMap }
  })),

  // Sync with RAB Store to ensure dependency safety
  syncFromRab: (rabItems) => {
    const lines = Object.values(rabItems)
      .filter(it => it.durasi_input > 0)
      .sort((a, b) => {
        if (a.start_date && b.start_date) return new Date(a.start_date) - new Date(b.start_date);
        return a.sort_order - b.sort_order;
      });
    set({ scheduleLines: lines });
  },
  
  clearScheduleStore: () => set({ scheduleLines: [], resources: [], dailyProgress: {} }),
}));

export default useScheduleStore;
