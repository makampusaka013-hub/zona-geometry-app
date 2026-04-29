import { supabase, getClientType } from '../supabase';

/**
 * Service Layer for Authentication (AuthHandler)
 */

export const authService = {
  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      // 1. Check for active session conflict (Prevent multi-login if restricted)
      const conflictError = await this.checkOnlineStatus(email);
      if (conflictError) throw new Error(conflictError);

      // 2. Perform sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // 3. Update heartbeat for conflict management
      if (data?.session) {
        await supabase.rpc('update_user_heartbeat', { 
          p_session_id: data.session.access_token,
          p_client_type: getClientType()
        });
      }

      return { data, error: null };
    } catch (error) {
      console.error('AuthService Login Error:', error);
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
   * Check if user is already online on another device
   */
  async checkOnlineStatus(email) {
    try {
      const actualClientType = getClientType();
      const { data, error } = await supabase.rpc('check_user_online_status', { 
        p_email: email.trim() 
      });

      if (!error && data) {
        const isConflict = (actualClientType === 'web' && data.web_active) || 
                          (actualClientType === 'mobile' && data.mobile_active);
                          
        if (isConflict) {
          const platformName = actualClientType === 'web' ? 'Browser/Laptop' : 'Aplikasi HP';
          return `Akun ini sedang digunakan di ${platformName} lain.`;
        }
      }
      return null;
    } catch (err) {
      return null;
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
