'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

/**
 * Custom hook to track active users in a project room using Supabase Presence.
 * 
 * @param {string} projectId 
 * @param {Object} member - Current user/member info
 * @returns {Array} List of active users
 */
export function useProjectPresence(projectId, member) {
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!projectId || !member) return;

    const channel = supabase.channel(`project_presence_${projectId}`, {
      config: {
        presence: {
          key: member.user_id || member.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat().map(p => ({
          user_id: p.user_id,
          name: p.name,
          role: p.role,
          avatar: p.avatar
        }));
        
        // Remove duplicates if any (though Presence key should prevent this)
        const uniqueUsers = Array.from(new Map(users.map(u => [u.user_id, u])).values());
        setOnlineUsers(uniqueUsers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: member.user_id || member.id,
            name: member.full_name || member.name || 'User',
            role: member.role || 'viewer',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [projectId, member]);

  return onlineUsers;
}
