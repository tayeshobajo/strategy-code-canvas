CREATE POLICY "Operators and admins can insert notifications"
ON public.operator_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'operator'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);