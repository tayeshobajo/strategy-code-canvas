DELETE FROM public.engine_spine_field_truth
WHERE project_id = 'f8019417-7ebf-4b56-a753-b24d734bf6f0'
  AND (updated_by_email = 'smoke@trusttai.com'
       OR field_key LIKE 'smoke_%');