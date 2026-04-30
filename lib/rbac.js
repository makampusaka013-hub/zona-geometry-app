/**
 * Role Based Access Control (RBAC) Utilities
 */

export const ROLES = {
  ADMIN: 'admin',
  ADVANCE: 'advance',
  PRO: 'pro',
  NORMAL: 'normal'
};

export const SLOT_ROLES = {
  OWNER: 'owner',
  PEMBUAT: 'pembuat',
  PENGECEK: 'pengecek',
  VIEWER: 'viewer'
};

/**
 * Check if a user can edit a project.
 * @param {Object} member - Current user member info
 * @param {string} projectOwnerId - Owner ID of the project
 * @param {string} userSlotRole - User's role in this specific project
 * @returns {boolean}
 */
export function canEditProject(member, projectOwnerId, userSlotRole) {
  if (!member) return false;
  if (member.isExpired) return false;

  // Admin & Advance can always edit everything? 
  // Actually, standard SaaS logic: Admin can, but members depend on slot.
  if (member.role === ROLES.ADMIN) return true;
  
  // Owner can always edit
  if (member.user_id === projectOwnerId) return true;

  // 'pembuat' can edit
  if (userSlotRole === SLOT_ROLES.PEMBUAT) return true;

  return false;
}

/**
 * Check if a user can approve a project.
 */
export function canApproveProject(member, projectOwnerId, userSlotRole) {
  if (!member || member.isExpired) return false;
  if (member.role === ROLES.ADMIN || member.role === ROLES.ADVANCE) return true;
  if (member.user_id === projectOwnerId && member.role !== ROLES.NORMAL) return true;
  if (userSlotRole === SLOT_ROLES.PENGECEK) return true;
  return false;
}
