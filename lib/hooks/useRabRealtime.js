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
    if (!projectId) return;

    console.log(`[Realtime] Subscribing to project: ${projectId} (clientId: ${myClientId})`);

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

          // 1. Loop Prevention: Ignore updates from same client/tab
          if (newItem && newItem.client_id === myClientId) {
            console.log('[Realtime] Ignoring update from self (same clientId)');
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
      .subscribe();

    return () => {
      console.log(`[Realtime] Unsubscribing from project: ${projectId}`);
      supabase.removeChannel(channel);
    };
  }, [projectId, currentUserId, patchRabItems, removeRabItem]);
}
