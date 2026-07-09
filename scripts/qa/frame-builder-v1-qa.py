#!/usr/bin/env python3
"""Frame Builder v1 QA harness — DB + server-fn shape checks.

Run from repo root:
  PGHOST=... python3 scripts/qa/frame-builder-v1-qa.py

This script verifies DB constraints and RLS. UI verification requires a
signed-in Playwright session — see /tmp/browser scripts.
"""
import os
import subprocess

def psql(sql):
    return subprocess.check_output(["psql", "-tAc", sql], text=True).strip()

print("== engine_project_frames grants ==")
print(psql("""
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='engine_project_frames'
ORDER BY grantee, privilege_type
"""))

print("\n== engine_project_frames policies ==")
print(psql("""
SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename='engine_project_frames'
"""))

print("\n== triggers ==")
print(psql("""
SELECT tgname FROM pg_trigger WHERE tgrelid='public.engine_project_frames'::regclass AND NOT tgisinternal
"""))

print("\n== frame counts ==")
print(psql("SELECT status, COUNT(*) FROM public.engine_project_frames GROUP BY status ORDER BY status"))

print("\n== recent frame events ==")
print(psql("""
SELECT event_type, COUNT(*) FROM public.engine_project_chat_events
WHERE event_type LIKE 'frame_%' GROUP BY event_type ORDER BY event_type
"""))

print("\nDone.")
