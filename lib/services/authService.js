import { supabase, getClientType } from '../supabase';

/**
 * Service Layer for Authentication (AuthHandler)
 */

export const authService = {
  /**
   * Login with email and password
   */
  async login(email, password) {
    console.log('AuthService: Memulai proses login final untuk:', email);
    try {
      // 1. Autentikasi Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        // Penanganan error spesifik
        if (authError.message.includes('Email not confirmed')) {
          throw new Error('Email Anda belum dikonfirmasi. Silakan cek inbox email Anda.');
        }
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error('Email atau Password salah.');
        }
        throw authError;
      }

      const user = data?.user;
      if (!user) throw new Error('User data tidak ditemukan setelah login.');

      // 2. Validasi & Sinkronisasi ke tabel 'members' (Inti Masalah #1 & #2)
      let { data: member, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Fallback: Jika member belum ada di tabel (Trigger gagal), buat manual sekarang
      if (!member && !memberError) {
        console.warn('AuthService: Member tidak ditemukan, menjalankan Fallback Sync...');
        const { data: newMember, error: syncError } = await supabase
          .from('members')
          .insert({
            user_id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email,
            role: user.user_metadata?.role || 'normal',
            approval_status: 'active' // Berikan akses sementara atau sesuai kebijakan
          })
          .select()
          .single();
        
        if (syncError) console.error('AuthService: Fallback Sync Gagal:', syncError);
        member = newMember;
      }

      // 3. Validasi Status Member (Inti Masalah #4)
      if (member) {
        if (member.approval_status === 'suspended') {
          await supabase.auth.signOut();
          throw new Error('Akun Anda ditangguhkan (Suspended). Silakan hubungi admin.');
        }
        // Jika masih pending, kita bisa beri akses terbatas atau redirect khusus nanti
      }

      // 4. Update heartbeat (Non-blocking)
      if (data?.session) {
        supabase.rpc('update_user_heartbeat', { 
          p_session_id: data.session.access_token,
          p_client_type: getClientType()
        }).catch(e => console.warn('Heartbeat update failed:', e));
      }

      console.log('AuthService: Login Berhasil & Terverifikasi.');
      return { data, error: null };
    } catch (error) {
      console.error('AuthService Final Login Error:', error.message);
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
