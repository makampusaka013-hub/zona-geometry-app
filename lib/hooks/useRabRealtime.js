'use client';

import { useEffect } from 'react';
import { supabase, clientId as myClientId } from '../supabase';
import useRabStore from '@/store/useRabStore';
import { RabLineItemSchema } from '../validations/rabSchema';

/**
 * useRabRealtime
 * Listens for changes to ahsp_lines for a specific project.
 * Implements tab-safe loop prevention and schema validation.
 */
export function useRabRealtime(projectId, currentUserId) {
  const patchRabItems = useRabStore(s => s.patchRabItems);
  const removeRabItem = useRabStore(s => s.removeRabItem);

  useEffect(() => {
    if (!projectId || !currentUserId) return;

    // Use a flag to avoid multiple subscriptions in rapid succession
    let isSubscribed = true;

    console.log(`[Realtime] Subscribing to project: ${projectId} (user: ${currentUserId}, client: ${myClientId})`);

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
          if (!isSubscribed) return;
          const { eventType, new: newItem, old: oldItem } = payload;

          // 1. Loop Prevention: Ignore updates from same client/tab
          if (newItem && newItem.client_id === myClientId) {
            return;
          }

          // 2. Schema Validation & Freshness Check
          if (newItem) {
            const parsed = RabLineItemSchema.safeParse(newItem);
            if (!parsed.success) {
              console.warn('[Realtime] Invalid payload received:', parsed.error);
              return;
            }
          }

          console.log(`[Realtime] Event: ${eventType}`, payload);

          // 3. Handle events
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            patchRabItems([newItem], 'remote', newItem.client_id);
          } else if (eventType === 'DELETE') {
            removeRabItem(oldItem.id);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Connected to project: ${projectId}`);
        }
      });

    return () => {
      console.log(`[Realtime] Cleaning up subscription for project: ${projectId}`);
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [projectId, currentUserId]); // Removed patchRabItems and removeRabItem as they are stable
}
