import { supabase, getClientType } from '../supabase';

/**
 * Service Layer for Authentication (AuthHandler)
 */

export const authService = {
  /**
   * Login with email and password
   */
  async login(email, password) {
    console.log('AuthService: Memulai proses login untuk:', email);
    try {
      // 1. Perform sign in - MURNI AUTENTIKASI TANPA GANGGUAN HEARTBEAT
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error('AuthService: Supabase Auth Error:', error);
        throw error;
      }

      console.log('AuthService: Login Supabase berhasil. User ID:', data?.user?.id);
      console.log('AuthService: Proses selesai, mengembalikan data ke UI.');
      return { data, error: null };
    } catch (error) {
      console.error('AuthService Login Fatal Error:', error);
      return { data: null, error };
    }
  },

  /**
   * Register a new user
   */
  async register(email, password, fullName) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: 'normal',
          },
        },
      });

      if (error) throw error;

      // Optional: Background notifications
      this._notifyAdmin(data?.user?.id, email, fullName);
      this._sendVerification(data?.user?.id, email, fullName);

      return { data, error: null };
    } catch (error) {
      console.error('AuthService Register Error:', error);
      return { data: null, error };
    }
  },

  /**
   * Sign in with Google OAuth
   */
  async loginWithGoogle() {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const redirectUrl = `${siteUrl}/auth/callback`;
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('AuthService Google Login Error:', error);
      return { error };
    }
  },

  /**
   * Request password reset link
   */
  async forgotPassword(email) {
    try {
      console.log('AuthService: Requesting password reset via Custom SMTP for', email);

      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal mengirim email reset via SMTP.');
      }

      return { error: null };
    } catch (error) {
      console.error('AuthService ForgotPassword Fatal Error:', {
        message: error.message,
        details: error,
        email: email
      });
      return { error };
    }
  },

  /**
   * Update current user's password
   */
  async updatePassword(newPassword) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('AuthService UpdatePassword Error:', error);
      return { error };
    }
  },

  /**
   * Private helpers for side-effects
   */
  async _notifyAdmin(userId, email, fullName) {
    if (!userId) return;
    fetch('/api/admin/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userEmail: email, fullName }),
    }).catch(e => console.error('Admin notify failed', e));
  },

  async _sendVerification(userId, email, fullName) {
    if (!userId) return;
    fetch('/api/auth/send-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email, fullName }),
    }).catch(e => console.error('Verification email failed', e));
  }
};
