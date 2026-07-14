
-- Defense-in-depth: scope email infra policies to service_role explicitly,
-- and revoke any privileges from anon/authenticated so the Data API can
-- never reach these tables even if a future policy is added incorrectly.

REVOKE ALL ON TABLE public.email_send_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_send_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_unsubscribe_tokens FROM anon, authenticated;

-- email_send_log
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;

CREATE POLICY "Service role can read send log"
  ON public.email_send_log FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can insert send log"
  ON public.email_send_log FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update send log"
  ON public.email_send_log FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- email_send_state
DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;

CREATE POLICY "Service role can manage send state"
  ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- email_unsubscribe_tokens
DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;

CREATE POLICY "Service role can read tokens"
  ON public.email_unsubscribe_tokens FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can insert tokens"
  ON public.email_unsubscribe_tokens FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used"
  ON public.email_unsubscribe_tokens FOR UPDATE TO service_role USING (true) WITH CHECK (true);
