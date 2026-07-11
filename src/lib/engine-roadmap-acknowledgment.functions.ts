/**
 * Phase 6C — Client Acknowledgment Flow
 *
 * acknowledgeRoadmap: called when a client formally confirms they have
 * reviewed and accepted the roadmap before phases begin.
 *
 * Writes to:
 *   - client_portal_roadmaps (acknowledged_at, acknowledged_by_email)
 *   - engine_delivery_items  (client_acknowledged_at, client_acknowledged_by_email)
 *   - engine_audit_log       (action: "roadmap_acknowledged")
 *   - client_portal_activity (event_type: "roadmap_acknowledged")
 *
 * Does NOT apply migrations. Does NOT change RLS policies.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const getSupabase = () => {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  return createClient<Database>(url, key);
};

export interface AcknowledgeRoadmapInput {
  /** The client_portal_roadmaps.id to acknowledge */
  portalRoadmapId: string;
  /** The portal project id (client_portal_projects.id) */
  projectId: string;
  /** Email address of the client confirming acknowledgment */
  acknowledgedByEmail: string;
  /** Optional delivery item id to also stamp */
  deliveryItemId?: string | null;
}

export interface AcknowledgeRoadmapResult {
  success: boolean;
  acknowledgedAt: string;
  error?: string;
}

/**
 * Formally acknowledges a roadmap on behalf of a client.
 * Safe to call from client-side with anon key — relies on RLS.
 * For internal/operator calls use service role via server action.
 */
export async function acknowledgeRoadmap(
  input: AcknowledgeRoadmapInput
): Promise<AcknowledgeRoadmapResult> {
  const { portalRoadmapId, projectId, acknowledgedByEmail, deliveryItemId } = input;

  if (!portalRoadmapId || !projectId || !acknowledgedByEmail) {
    return { success: false, acknowledgedAt: '', error: 'Missing required fields' };
  }

  const supabase = getSupabase();
  const acknowledgedAt = new Date().toISOString();

  // 1. Stamp client_portal_roadmaps
  const { error: roadmapErr } = await supabase
    .from('client_portal_roadmaps')
    .update({
      acknowledged_at: acknowledgedAt,
      acknowledged_by_email: acknowledgedByEmail,
    })
    .eq('id', portalRoadmapId)
    .eq('project_id', projectId)
    .is('acknowledged_at', null); // idempotent — only stamp once

  if (roadmapErr) {
    return { success: false, acknowledgedAt: '', error: roadmapErr.message };
  }

  // 2. Stamp engine_delivery_items if a delivery item is linked
  if (deliveryItemId) {
    await supabase
      .from('engine_delivery_items')
      .update({
        client_acknowledged_at: acknowledgedAt,
        client_acknowledged_by_email: acknowledgedByEmail,
        status: 'acknowledged',
        last_action: 'client_acknowledged',
      })
      .eq('id', deliveryItemId)
      .eq('project_id', projectId);
    // Non-fatal: continue even if delivery item update fails
  }

  // 3. Write audit entry
  await supabase.from('engine_audit_log').insert({
    project_id: projectId,
    action: 'roadmap_acknowledged',
    actor_email: acknowledgedByEmail,
    target_id: portalRoadmapId,
    affected_modules: ['roadmap', 'client_portal'],
    summary: `Client acknowledged roadmap (${portalRoadmapId})`,
    metadata: {
      portal_roadmap_id: portalRoadmapId,
      delivery_item_id: deliveryItemId ?? null,
      acknowledged_at: acknowledgedAt,
    },
  });

  // 4. Write portal activity event (client-visible)
  await supabase.from('client_portal_activity').insert({
    project_id: projectId,
    event_type: 'roadmap_acknowledged',
    actor_type: 'client',
    actor_email: acknowledgedByEmail,
    client_visible: true,
    summary: 'Client acknowledged and accepted the roadmap.',
    metadata: {
      portal_roadmap_id: portalRoadmapId,
      acknowledged_at: acknowledgedAt,
    },
  });

  return { success: true, acknowledgedAt };
}

/**
 * Fetches the acknowledgment state of a portal roadmap.
 * Returns null if roadmap not found.
 */
export async function getRoadmapAcknowledgmentState(
  portalRoadmapId: string,
  projectId: string
): Promise<{
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByEmail: string | null;
} | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('client_portal_roadmaps')
    .select('acknowledged_at, acknowledged_by_email')
    .eq('id', portalRoadmapId)
    .eq('project_id', projectId)
    .single();

  if (error || !data) return null;

  return {
    acknowledged: !!data.acknowledged_at,
    acknowledgedAt: data.acknowledged_at ?? null,
    acknowledgedByEmail: data.acknowledged_by_email ?? null,
  };
}
