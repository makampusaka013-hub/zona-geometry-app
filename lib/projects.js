/**
 * Payload insert proyek: dimiliki langsung oleh members.user_id (tanpa workspaces).
 * Kirim `created_by` agar trigger `projects_after_insert_add_creator` (jika ada) tetap jalan.
 */
export function buildNewProjectPayload({ name, userId }) {
  return {
    name,
    user_id: userId,
    created_by: userId,
  };
}
