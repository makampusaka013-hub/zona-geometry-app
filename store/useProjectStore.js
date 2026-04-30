import { create } from 'zustand';
import { 
  getProjectTabData, 
  fetchMemberInfo, 
  fetchUserMembershipSlots, 
  fetchUserProjects,
  fetchLocations,
  syncUserLocation,
  upsertProject,
  joinProjectByCode,
  deleteProject,
  leaveProject,
  assignProjectSlot,
  resetProjectSlot,
  removeProjectMember,
  updateLineApprovalStatus,
  updateProjectStartDate as serviceUpdateProjectStartDate,
  updateLineStartDate as serviceUpdateLineStartDate,
  updateLineResource as serviceUpdateLineResource,
  fetchProjectMembers,
  fetchRabData,
  saveRabData,
  saveLumpsumToMaster
} from '@/lib/services/rabService';
import { supabase } from '@/lib/supabase';

/**
 * useProjectStore
 * Global state management for Zona Geometry projects using Zustand.
 * Enforces Single Source of Truth (SSOT) architecture.
 */
const useProjectStore = create((set, get) => ({
  // --- STATE ---
  member: null,         
  projects: [],         
  selectedProject: '',  
  locations: [],        
  isLoading: true,      
  
  tabData: {            
    ahsp: [], 
    harga: [], 
    tkdn: null, 
    dok: [],
    schedule: { lines: [], resources: [] },
    cco: [], 
    mc: [],
    backup: [],
  },
  ahspCatalog: {},      
  tabLoading: false,    
  tabVersion: 0,        

  // --- ACTIONS ---

  initStore: async () => {
    set({ isLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        set({ isLoading: false });
        return { error: 'No session' };
      }

      const [memberRes, locationsRes] = await Promise.all([
        fetchMemberInfo(user.id),
        fetchLocations()
      ]);

      if (memberRes.error) throw memberRes.error;
      set({ member: memberRes.data, locations: locationsRes.data || [] });

      const slotsRes = await fetchUserMembershipSlots(user.id);
      const accessibleIds = (slotsRes.data || []).map(m => m.project_id);
      
      const projectsRes = await fetchUserProjects(user.id, accessibleIds);
      if (projectsRes.error) throw projectsRes.error;

      set({ projects: projectsRes.data });
      return { data: projectsRes.data };
    } catch (error) {
      console.error('Error initializing store:', error);
      return { error };
    } finally {
      set({ isLoading: false });
    }
  },

  setSelectedProject: (projectId) => {
    set({ selectedProject: projectId });
    const { projects, member } = get();
    if (projectId && member?.user_id) {
      const proj = projects.find(p => p.id === projectId);
      if (proj?.location_id) {
        syncUserLocation(member.user_id, proj.location_id);
      }
    }
  },

  refreshProjects: async () => {
    const { member } = get();
    if (!member?.user_id) return;
    const slotsRes = await fetchUserMembershipSlots(member.user_id);
    const accessibleIds = (slotsRes.data || []).map(m => m.project_id);
    const projectsRes = await fetchUserProjects(member.user_id, accessibleIds);
    if (!projectsRes.error) set({ projects: projectsRes.data });
  },

  setProjects: (projects) => set({ projects }),

  updateProjectInList: (projectId, updates) => set((state) => ({
    projects: state.projects.map(p => p.id === projectId ? { ...p, ...updates } : p)
  })),

  saveProjectIdentity: async (projectId, payload) => {
    set({ tabLoading: true });
    try {
      const { data, error } = await upsertProject(projectId, payload);
      if (error) throw error;
      if (projectId) {
        get().updateProjectInList(projectId, data);
      } else {
        set((state) => ({ projects: [data, ...state.projects] }));
      }
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    } finally {
      set({ tabLoading: false });
    }
  },

  handleJoinProject: async (joinCode) => {
    const { member } = get();
    const { data, error } = await joinProjectByCode(member.user_id, joinCode);
    if (!error) await get().refreshProjects();
    return { data, error };
  },

  handleDeleteProject: async (projectId) => {
    const { error } = await deleteProject(projectId);
    if (!error) {
      set((state) => ({
        projects: state.projects.filter(p => p.id !== projectId),
        selectedProject: state.selectedProject === projectId ? '' : state.selectedProject
      }));
    }
    return { error };
  },

  handleLeaveProject: async (projectId) => {
    const { error } = await leaveProject(projectId);
    if (!error) await get().refreshProjects();
    return { error };
  },

  handleAssignSlot: async (projectId, userId, slotRole) => {
    const result = await assignProjectSlot(projectId, userId, slotRole);
    if (!result.error) await get().refreshProjects();
    return result;
  },

  handleResetSlot: async (projectId, slotRole) => {
    const result = await resetProjectSlot(projectId, slotRole);
    if (!result.error) await get().refreshProjects();
    return result;
  },

  handleRemoveMember: async (projectId, userId) => {
    const result = await removeProjectMember(projectId, userId);
    if (!result.error) await get().refreshProjects();
    return result;
  },

  handleUpdateLineStatus: async (lineId, status) => {
    set({ tabLoading: true });
    const result = await updateLineApprovalStatus(lineId, status);
    if (!result.error) {
      set((state) => ({
        tabData: {
          ...state.tabData,
          ahsp: state.tabData.ahsp.map(l => l.id === lineId ? { ...l, status_approval: status } : l),
          schedule: {
            ...state.tabData.schedule,
            lines: state.tabData.schedule.lines.map(l => l.id === lineId ? { ...l, status_approval: status } : l)
          }
        }
      }));
    }
    set({ tabLoading: false });
    return result;
  },

  updateProjectStartDate: async (projectId, startDate) => {
    const { error } = await serviceUpdateProjectStartDate(projectId, startDate);
    if (!error) {
      get().updateProjectInList(projectId, { start_date: startDate });
    }
    return { error };
  },

  updateLineStartDate: async (lineId, startDate) => {
    const { error } = await serviceUpdateLineStartDate(lineId, startDate);
    if (!error) {
      set((state) => ({
        tabData: {
          ...state.tabData,
          schedule: {
            ...state.tabData.schedule,
            lines: state.tabData.schedule.lines.map(l => l.id === lineId ? { ...l, start_date: startDate } : l)
          }
        }
      }));
    }
    return { error };
  },

  updateLineResource: async (lineId, field, value) => {
    const { error } = await serviceUpdateLineResource(lineId, field, value);
    if (!error) {
      set((state) => ({
        tabData: {
          ...state.tabData,
          schedule: {
            ...state.tabData.schedule,
            lines: state.tabData.schedule.lines.map(l => l.id === lineId ? { ...l, [field]: value } : l)
          }
        }
      }));
    }
    return { error };
  },

  fetchProjectMembers: async (projectId) => {
    return await fetchProjectMembers(projectId);
  },

  // --- RAB EDITOR ACTIONS ---
  
  loadRabData: async (projectId) => {
    return await fetchRabData(projectId);
  },

  saveRabData: async (projectId, identityPayload, allLines, deleteMissing = true) => {
    const result = await saveRabData(projectId, identityPayload, allLines, deleteMissing);
    if (!result.error) {
       await get().refreshProjects();
    }
    return result;
  },

  saveLumpsumToMaster: async (item) => {
    return await saveLumpsumToMaster(item);
  },

  fetchTabData: async (tab, projectId, currentProjectObj = null) => {
    if (!projectId) {
      set({ 
        tabData: { ahsp: [], harga: [], tkdn: null, dok: [], schedule: { lines: [], resources: [] }, cco: [], mc: [] },
        tabLoading: false 
      });
      return;
    }

    const { tabVersion, tabData } = get();
    const nextVersion = tabVersion + 1;
    set({ tabVersion: nextVersion });

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

    if (!hasData) set({ tabLoading: true });

    try {
      const { data, error } = await getProjectTabData(tab, projectId, currentProjectObj);
      if (get().tabVersion === nextVersion) {
        if (error) throw error;
        const { catalog, ...restData } = data || {};
        set((state) => ({
          tabData: { ...state.tabData, ...restData },
          ahspCatalog: catalog ? { ...state.ahspCatalog, ...catalog } : state.ahspCatalog,
          tabLoading: false
        }));
      }
    } catch (error) {
      if (get().tabVersion === nextVersion) set({ tabLoading: false });
    }
  },

  setTabData: (data) => set((state) => ({ 
    tabData: typeof data === 'function' ? data(state.tabData) : { ...state.tabData, ...data } 
  })),

  setTabLoading: (status) => set({ tabLoading: status }),
}));

export default useProjectStore;
