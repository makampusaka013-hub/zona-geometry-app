import { create } from 'zustand';
import {
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
  updateProjectStartDate as serviceUpdateProjectStartDate,
  fetchProjectMembers,
  fetchRabData,
  fetchAllAhspCatalog
} from '@/lib/services/rabService';
import { supabase } from '@/lib/supabase';

/**
 * useProjectStore
 * Focused on core project metadata and user membership.
 * Enforces Single Source of Truth (SSOT) architecture.
 */
const useProjectStore = create((set, get) => ({
  // --- STATE ---
  member: null,
  projects: {},         // Normalized: { [id]: project }
  selectedProject: '',
  locations: [],
  tabData: { schedule: { lines: [] }, ahsp: [], harga: [], rab: [], changes: [], backup: [] },
  tabLoading: false,
  allRoles: {},          // { [projectId]: slot_role }

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
      const rolesMap = {};
      (slotsRes.data || []).forEach(m => {
        rolesMap[m.project_id] = m.slot_role;
      });
      const accessibleIds = Object.keys(rolesMap);

      const projectsRes = await fetchUserProjects(user.id, accessibleIds);
      if (projectsRes.error) throw projectsRes.error;

      const normalizedProjects = {};
      (projectsRes.data || []).forEach(p => {
        normalizedProjects[p.id] = p;
      });

      set({ projects: normalizedProjects, allRoles: rolesMap });
      return { data: projectsRes.data };
    } catch (error) {
      console.error('Error initializing store:', error);
      return { error };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTabData: async (activeTab, projectId, projectObj) => {
    if (!projectId || activeTab === 'daftar') return;
    set({ tabLoading: true });
    try {
      const { lines, masterPrices, masterDetails, resources, tkdnSummary } = await fetchRabData(projectId);
      
      const nextTabData = { 
        ...get().tabData, 
        rab: lines || [], 
        ahsp: lines || [],
        harga: resources || [],
        tkdn: tkdnSummary || { total_nilai: 0, total_tkdn_nilai: 0, total_tkdn_pct: 0, byJenis: {} },
        schedule: { lines: lines || [] }
      };
      const nextCatalog = { ...get().ahspCatalog, ...(masterDetails || {}) };

      if ((activeTab === 'proyek' || activeTab === 'progress' || activeTab === 'terpakai') && (!masterDetails || Object.keys(masterDetails).length === 0)) {
        const catalogRes = await fetchAllAhspCatalog();
        if (catalogRes.data) {
          catalogRes.data.forEach(item => {
            nextCatalog[item.master_ahsp_id] = item.details || [];
          });
        }
      }

      if (activeTab === 'perubahan') {
        const { data: changes } = await supabase.from('project_changes').select('*').eq('project_id', projectId);
        nextTabData.changes = changes || [];
      }

      set({ 
        tabData: nextTabData, 
        ahspCatalog: nextCatalog,
        tabLoading: false 
      });
    } catch (err) {
      console.error('Error fetchTabData:', err);
      set({ tabLoading: false });
    }
  },

  setSelectedProject: (projectId) => {
    set({ selectedProject: projectId });
    const { projects, member } = get();
    if (projectId && member?.user_id) {
      const proj = projects[projectId];
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
    if (!projectsRes.error) {
      const normalizedProjects = {};
      (projectsRes.data || []).forEach(p => {
        normalizedProjects[p.id] = p;
      });
      set({ projects: normalizedProjects });
    }
  },

  setProjects: (projectsArray) => {
    const normalized = {};
    projectsArray.forEach(p => { normalized[p.id] = p; });
    set({ projects: normalized });
  },

  updateProjectInList: (projectId, updates) => set((state) => ({
    projects: {
      ...state.projects,
      [projectId]: { ...state.projects[projectId], ...updates }
    }
  })),

  saveProjectIdentity: async (projectId, payload) => {
    try {
      // Always get the FRESH state directly from get() to avoid stale closures
      const currentProj = get().projects[projectId];
      
      const finalPayload = { 
        ...payload, 
        // Use payload version if provided, otherwise fallback to the most recent store version
        version: payload.version || currentProj?.version || 1 
      };
      
      const { data, error } = await upsertProject(projectId, finalPayload);
      if (error) throw error;
      
      if (projectId) {
        get().updateProjectInList(projectId, data);
      } else {
        set((state) => ({
          projects: { ...state.projects, [data.id]: data }
        }));
      }
      return { data, error: null };
    } catch (error) {
      console.error('Error in saveProjectIdentity store action:', error);
      return { data: null, error };
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
      set((state) => {
        const { [projectId]: _, ...rest } = state.projects;
        return {
          projects: rest,
          selectedProject: state.selectedProject === projectId ? '' : state.selectedProject
        };
      });
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

  updateProjectStartDate: async (projectId, startDate) => {
    const { data, error } = await serviceUpdateProjectStartDate(projectId, startDate);
    if (!error && data) {
      get().updateProjectInList(projectId, data);
    }
    return { error };
  },

  fetchProjectMembers: async (projectId) => {
    return await fetchProjectMembers(projectId);
  },

  getProjectsArray: () => Object.values(get().projects),
}));

export default useProjectStore;
