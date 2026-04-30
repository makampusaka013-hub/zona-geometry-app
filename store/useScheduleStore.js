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
  
  clearScheduleStore: () => set({ scheduleLines: [], resources: [], dailyProgress: {} }),
}));

export default useScheduleStore;
