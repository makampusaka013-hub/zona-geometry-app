/**
 * Toast Notification Singleton
 * Gunakan: import { toast } from '@/lib/toast'
 * - toast.success(msg)
 * - toast.error(msg)
 * - toast.warning(msg)
 * - toast.info(msg)
 * - await toast.confirm(msg)  → returns Promise<boolean>
 */

let _addToast = null;
let _addConfirm = null;

export const toast = {
  _register(addToastFn, addConfirmFn) {
    _addToast = addToastFn;
    _addConfirm = addConfirmFn;
  },

  success(message, duration = 4000) {
    if (_addToast) _addToast({ type: 'success', message, duration });
  },

  error(message, duration = 6000) {
    if (_addToast) _addToast({ type: 'error', message, duration });
  },

  warning(message, duration = 5000) {
    if (_addToast) _addToast({ type: 'warning', message, duration });
  },

  info(message, duration = 4000) {
    if (_addToast) _addToast({ type: 'info', message, duration });
  },

  /**
   * Menampilkan dialog konfirmasi modern (pengganti window.confirm)
   * @returns {Promise<boolean>} - true jika user klik Konfirmasi, false jika Batal
   */
  confirm(message, subMessage = '') {
    return new Promise((resolve) => {
      if (_addConfirm) {
        _addConfirm({ message, subMessage, resolve });
      } else {
        // Fallback ke window.confirm jika ToastProvider belum siap
        resolve(window.confirm(message));
      }
    });
  },
};
