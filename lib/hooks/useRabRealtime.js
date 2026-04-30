'use client';

import { useEffect } from 'react';
import { supabase } from '../supabase';
import useRabStore from '@/store/useRabStore';

/**
 * useRabRealtime
 * Listens for changes to ahsp_lines for a specific project.
 * Implements loop prevention and scoped filtering.
 */
export function useRabRealtime(projectId, currentUserId) {
  const { patchRabItems, removeRabItem } = useRabStore();

  useEffect(() => {
    if (!projectId) return;

    console.log(`[Realtime] Subscribing to project: ${projectId}`);

    const channel = supabase
      .channel(`rab_changes_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ahsp_lines',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          const { eventType, new: newItem, old: oldItem } = payload;

          // 1. Loop Prevention: Ignore updates from self
          if (newItem && newItem.updated_by === currentUserId) {
            console.log('[Realtime] Ignoring update from self');
            return;
          }

          console.log(`[Realtime] Event: ${eventType}`, payload);

          // 2. Handle events
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            patchRabItems([newItem], 'remote');
          } else if (eventType === 'DELETE') {
            removeRabItem(oldItem.id);
          }
        }
      )
      .subscribe();

    return () => {
      console.log(`[Realtime] Unsubscribing from project: ${projectId}`);
      supabase.removeChannel(channel);
    };
  }, [projectId, currentUserId, patchRabItems, removeRabItem]);
}
