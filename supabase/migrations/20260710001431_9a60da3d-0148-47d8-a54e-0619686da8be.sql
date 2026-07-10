UPDATE auth.users
SET encrypted_password = crypt('1Manchester$', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE lower(email) = lower('Tai@trust-tai.com');