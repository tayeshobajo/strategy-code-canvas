import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Source & Truth Inspector context (Sprint 1, Wave 1).
 *
 * A single global drawer that any approved Spine statement can open to see
 * evidence, provenance, and the truth-status trail behind the statement.
 * Callers pass an inspection target; the drawer (SourceTruthInspector)
 * consumes this context and lazily fetches the payload via
 * `getSourceInspection`.
 */

export type InspectorTarget = {
  projectId: string;
  sectionKey: string;
  fieldKey: string;
  /** Optional inline preview shown in the drawer header while data loads. */
  statement?: string | null;
  /** Optional label if the field key isn't self-describing. */
  label?: string | null;
};

type InspectorContextValue = {
  target: InspectorTarget | null;
  open: (target: InspectorTarget) => void;
  close: () => void;
};

const InspectorContext = createContext<InspectorContextValue | null>(null);

export function SourceInspectorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<InspectorTarget | null>(null);
  const open = useCallback((t: InspectorTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);
  const value = useMemo(() => ({ target, open, close }), [target, open, close]);
  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>;
}

export function useSourceInspector(): InspectorContextValue {
  const ctx = useContext(InspectorContext);
  if (!ctx) {
    // Provider is optional — outside /engine the inspector is a no-op.
    return {
      target: null,
      open: () => {},
      close: () => {},
    };
  }
  return ctx;
}
