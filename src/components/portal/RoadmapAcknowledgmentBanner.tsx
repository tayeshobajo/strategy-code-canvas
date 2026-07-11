/**
 * Phase 6C — RoadmapAcknowledgmentBanner
 *
 * Shown at the top of the client portal roadmap view.
 * When not yet acknowledged: displays a prominent call-to-action
 * requiring the client to formally confirm they have reviewed the roadmap.
 * When acknowledged: shows a quiet confirmation badge.
 *
 * Prevents the portal from showing "Phases Begin" status until
 * acknowledgedAt is set on the portal roadmap record.
 */

import { useState } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { acknowledgeRoadmap } from '@/lib/engine-roadmap-acknowledgment.functions';

interface RoadmapAcknowledgmentBannerProps {
  portalRoadmapId: string;
  projectId: string;
  clientEmail: string;
  /** If already acknowledged, pass the timestamp */
  acknowledgedAt?: string | null;
  acknowledgedByEmail?: string | null;
  /** Optional linked delivery item id to co-stamp */
  deliveryItemId?: string | null;
  /** Called after successful acknowledgment so parent can refetch/update */
  onAcknowledged?: (acknowledgedAt: string) => void;
}

export function RoadmapAcknowledgmentBanner({
  portalRoadmapId,
  projectId,
  clientEmail,
  acknowledgedAt,
  acknowledgedByEmail,
  deliveryItemId,
  onAcknowledged,
}: RoadmapAcknowledgmentBannerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAcknowledgedAt, setLocalAcknowledgedAt] = useState<string | null>(
    acknowledgedAt ?? null
  );

  const isAcknowledged = !!localAcknowledgedAt;

  const handleAcknowledge = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await acknowledgeRoadmap({
        portalRoadmapId,
        projectId,
        acknowledgedByEmail: clientEmail,
        deliveryItemId,
      });

      if (result.success) {
        setLocalAcknowledgedAt(result.acknowledgedAt);
        onAcknowledged?.(result.acknowledgedAt);
      } else {
        setError(result.error ?? 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isAcknowledged) {
    const date = new Date(localAcknowledgedAt!).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
        <span>
          Roadmap acknowledged on <strong>{date}</strong>.
          {acknowledgedByEmail && acknowledgedByEmail !== clientEmail && (
            <> Confirmed by {acknowledgedByEmail}.</>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <h3 className="mb-1 text-sm font-semibold text-amber-900">
            Action Required: Acknowledge Your Roadmap
          </h3>
          <p className="mb-4 text-sm text-amber-800 leading-relaxed">
            Please review your roadmap in full before confirming. Once acknowledged,
            your project phases will be formally initiated. This cannot be undone.
          </p>

          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {error}
            </p>
          )}

          <button
            onClick={handleAcknowledge}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                I have reviewed and accept this roadmap
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
