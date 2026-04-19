import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Global promise to prevent concurrent auth calls causing lock issues
let _sessionPromise = null;
export async function safeGetSession() {
  if (_sessionPromise) return _sessionPromise;
  _sessionPromise = supabase.auth.getSession().finally(() => {
    _sessionPromise = null;
  });
  return _sessionPromise;
}

/**
 * Detect client type based on context.
 * For now, defaults to 'web' for this Next.js app.
 * Can be extended to check for user agents or injected properties from a mobile wrapper.
 */
export function getClientType() {
  if (typeof window === 'undefined') return 'web';
  
  const ua = window.navigator.userAgent.toLowerCase();
  
  // Basic detection for mobile apps / wrappers
  if (ua.includes('capacitor') || ua.includes('cordova') || ua.includes('zona-mobile-app')) {
    return 'mobile';
  }
  
  return 'web';
}
