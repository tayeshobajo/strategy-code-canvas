-- Phase H6 · J4 — Universal impact_summary on chat proposals
ALTER TABLE public.engine_project_chat_proposals
  ADD COLUMN IF NOT EXISTS impact_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.engine_project_chat_proposals.impact_summary IS
  'Standardised proposal impact: {scope, budgetDelta, timelineDelta, dependencies, clientExpectations, reversibility, risks}. Rendered by ProposalImpactPanel.';

UPDATE public.engine_project_chat_proposals
   SET impact_summary = jsonb_strip_nulls(jsonb_build_object(
         'scope', payload->>'scope',
         'reversibility', CASE WHEN proposal_type = 'implementation_prompt' THEN 'hard' ELSE 'reversible' END
       ))
 WHERE impact_summary = '{}'::jsonb;

-- Phase H6 · I11 — risk_score on review items
-- Add the prerequisite input columns first (nullable / defaulted).
ALTER TABLE public.engine_review_items
  ADD COLUMN IF NOT EXISTS severity      text,
  ADD COLUMN IF NOT EXISTS impact_score  int,
  ADD COLUMN IF NOT EXISTS urgency_score int,
  ADD COLUMN IF NOT EXISTS deadline_at   timestamptz,
  ADD COLUMN IF NOT EXISTS client_risk   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_score    int NOT NULL DEFAULT 0
    CHECK (risk_score BETWEEN 0 AND 100);

ALTER TABLE public.engine_review_items
  DROP CONSTRAINT IF EXISTS engine_review_items_severity_check;
ALTER TABLE public.engine_review_items
  ADD CONSTRAINT engine_review_items_severity_check
  CHECK (severity IS NULL OR severity IN ('low','medium','high','critical'));

ALTER TABLE public.engine_review_items
  DROP CONSTRAINT IF EXISTS engine_review_items_impact_score_check;
ALTER TABLE public.engine_review_items
  ADD CONSTRAINT engine_review_items_impact_score_check
  CHECK (impact_score IS NULL OR (impact_score BETWEEN 0 AND 100));

ALTER TABLE public.engine_review_items
  DROP CONSTRAINT IF EXISTS engine_review_items_urgency_score_check;
ALTER TABLE public.engine_review_items
  ADD CONSTRAINT engine_review_items_urgency_score_check
  CHECK (urgency_score IS NULL OR (urgency_score BETWEEN 0 AND 100));

CREATE INDEX IF NOT EXISTS engine_review_items_risk_score_idx
  ON public.engine_review_items (risk_score DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_engine_review_items_risk_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  sev_fallback int := CASE NEW.severity
    WHEN 'critical' THEN 90
    WHEN 'high'     THEN 70
    WHEN 'medium'   THEN 45
    WHEN 'low'      THEN 20
    ELSE 45 END;
  impact  int := COALESCE(NEW.impact_score, sev_fallback);
  urgency int := COALESCE(NEW.urgency_score, sev_fallback);
  deadline_days numeric := CASE WHEN NEW.deadline_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NEW.deadline_at - now())) / 86400 END;
  deadline_component int := CASE
    WHEN deadline_days IS NULL THEN 0
    WHEN deadline_days <= 0 THEN 100
    WHEN deadline_days <= 1 THEN 90
    WHEN deadline_days <= 3 THEN 75
    WHEN deadline_days <= 7 THEN 60
    WHEN deadline_days <= 14 THEN 40
    WHEN deadline_days <= 30 THEN 25
    ELSE 10 END;
  base numeric := impact * 0.4 + urgency * 0.4 + deadline_component * 0.2;
BEGIN
  IF NEW.client_risk IS TRUE THEN base := base + 10; END IF;
  NEW.risk_score := GREATEST(0, LEAST(100, ROUND(base)::int));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_review_items_risk_score ON public.engine_review_items;
CREATE TRIGGER engine_review_items_risk_score
  BEFORE INSERT OR UPDATE OF severity, impact_score, urgency_score, deadline_at, client_risk
  ON public.engine_review_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_review_items_risk_score();

-- Backfill risk_score for existing rows (trigger only fires on write).
UPDATE public.engine_review_items SET severity = severity;