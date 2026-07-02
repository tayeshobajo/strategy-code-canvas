
-- Add per-step JSONB storage + progress on engine_projects
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS current_step_num smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS progress_pct smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signal_room jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS point_a jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS point_b jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hidden_assets jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gap_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS blueprint jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS roadmap jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sequencing jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deadlines jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS investment jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS client_preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS health_score smallint NOT NULL DEFAULT 0;

-- Seed Mental Dental Academy workspace content (only if row exists)
UPDATE public.engine_projects p
SET
  current_step_num = 4,
  progress_pct = 38,
  health_score = 61,
  point_a = jsonb_build_object(
    'lenses', jsonb_build_array(
      jsonb_build_object('label','Business Stage','value','Growth','hint','Scaling content platform'),
      jsonb_build_object('label','Primary Model','value','Education','hint','Exam prep platform (B2C + B2B2C)'),
      jsonb_build_object('label','Core Audience','value','Students','hint','International dentists & dental students'),
      jsonb_build_object('label','Revenue Model','value','Subscription','hint','Monthly & annual access'),
      jsonb_build_object('label','Current Tech','value','Squarespace','hint','Content site + Stripe'),
      jsonb_build_object('label','Active Students','value','~75','hint','Need migration strategy')
    ),
    'diagnosis', jsonb_build_array(
      jsonb_build_object('title','Offer & Positioning','tag','PARTIAL','bullets', jsonb_build_array('Strong content authority','Clear exam focus (NBDE & ADAT)','Offers exist but paths not fully structured','Message could be more outcome driven')),
      jsonb_build_object('title','Student Journey','tag','LIMITED','bullets', jsonb_build_array('Website lacks clear learning pathways','No integrated dashboard experience','No assessment or readiness engine','Enrollment flow can be improved')),
      jsonb_build_object('title','Learning Platform','tag','MISSING','bullets', jsonb_build_array('No Q-bank or mock exams','No progress tracking','No analytics or reporting','No live class management system')),
      jsonb_build_object('title','School (Institution) Layer','tag','MISSING','bullets', jsonb_build_array('No multi-tenant capability','No school admin dashboard','No cohort analytics','No risk flag or student monitoring')),
      jsonb_build_object('title','Data & Analytics','tag','MISSING','bullets', jsonb_build_array('No student performance data','No weak area detection','No reporting for schools','No readiness scoring')),
      jsonb_build_object('title','Operations & Automation','tag','LIMITED','bullets', jsonb_build_array('Manual student support','Manual access control','No automated emails or reminders','No workflow system')),
      jsonb_build_object('title','Content & IP Protection','tag','RISK','bullets', jsonb_build_array('Videos downloadable risk','PDFs not watermarked','No content access controls','Needs stronger protection')),
      jsonb_build_object('title','Payments & Access','tag','PARTIAL','bullets', jsonb_build_array('Stripe in place (good)','Access tied to subscriptions','No license management for schools')),
      jsonb_build_object('title','Team & Resources','tag','CONSTRAINT','bullets', jsonb_build_array('Solo founder operation','High content creation load','Limited time for operations','Needs leverage systems'))
    ),
    'key_diagnosis', 'Mental Dental has deep content authority and a loyal audience, but the platform infrastructure, student experience, and school readiness systems are not yet in place to scale the mission and serve institutions at the level of top-tier board prep platforms.'
  ),
  point_b = jsonb_build_object(
    '24_month_destination','Recognized international leader for NBDE/ADAT preparation with a defensible learning platform and 5+ dental schools onboarded.',
    '10_year_position','The default global infrastructure for dental board readiness.',
    'client_outcome','Every student gets a personalized readiness path with measurable progress.',
    'customer_outcome','Schools get institutional visibility into cohort readiness and can act on risk flags early.',
    'operational_outcome','Founder time shifts from support & delivery to strategy & partnerships.',
    'revenue_outcome','Subscription + institutional licensing forming a durable multi-line revenue base.',
    'brand_position','The trusted authority for dental board exam success.'
  ),
  hidden_assets = jsonb_build_object(
    'categories', jsonb_build_array(
      jsonb_build_object('name','Audience','items', jsonb_build_array('Loyal student community','International reach','High word-of-mouth referrals')),
      jsonb_build_object('name','Content','items', jsonb_build_array('Deep NBDE/ADAT question library','Video lectures','Notes and study guides')),
      jsonb_build_object('name','Product','items', jsonb_build_array('Existing subscription product','Proven exam prep methodology')),
      jsonb_build_object('name','Data','items', jsonb_build_array('Historical student engagement','Enrollment patterns')),
      jsonb_build_object('name','Relationships','items', jsonb_build_array('Faculty relationships','Alumni network')),
      jsonb_build_object('name','Authority','items', jsonb_build_array('Founder credibility in dental education','Track record of student results')),
      jsonb_build_object('name','Operations','items', jsonb_build_array('Established support playbook','Existing Stripe workflows')),
      jsonb_build_object('name','Commercial','items', jsonb_build_array('Institutional interest signals','Referral pipeline from schools'))
    )
  ),
  gap_map = jsonb_build_object(
    'categories', jsonb_build_array(
      jsonb_build_object('name','Strategy','items', jsonb_build_array('Institutional GTM missing','Positioning for schools undefined')),
      jsonb_build_object('name','Experience','items', jsonb_build_array('No learning pathway','No student dashboard')),
      jsonb_build_object('name','Platform','items', jsonb_build_array('Q-bank engine','Mock exam engine','Live class engine')),
      jsonb_build_object('name','Data','items', jsonb_build_array('No performance data pipeline','No cohort analytics')),
      jsonb_build_object('name','Analytics','items', jsonb_build_array('No readiness scoring','No risk flags')),
      jsonb_build_object('name','Automation','items', jsonb_build_array('No lifecycle emails','No workflow engine')),
      jsonb_build_object('name','Growth','items', jsonb_build_array('No referral system','No paid channel strategy')),
      jsonb_build_object('name','Content Protection','items', jsonb_build_array('No DRM','No watermarking','No access audit')),
      jsonb_build_object('name','Migration','items', jsonb_build_array('~75 students to migrate from Squarespace','No import tooling yet'))
    )
  ),
  blueprint = jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('id','marketing_site','name','Marketing Site','group','front'),
      jsonb_build_object('id','enrollment_engine','name','Enrollment Engine','group','front'),
      jsonb_build_object('id','student_portal','name','Student Portal','group','learning'),
      jsonb_build_object('id','q_bank','name','Q-Bank Engine','group','learning'),
      jsonb_build_object('id','mock_exam','name','Mock Exam Engine','group','learning'),
      jsonb_build_object('id','live_class','name','Live Class Engine','group','learning'),
      jsonb_build_object('id','school_portal','name','School Portal','group','institution'),
      jsonb_build_object('id','owner_console','name','Ryan Owner Console','group','institution'),
      jsonb_build_object('id','ai_layer','name','AI Knowledge Layer','group','intelligence'),
      jsonb_build_object('id','stripe_access','name','Stripe + Access Layer','group','commercial'),
      jsonb_build_object('id','analytics','name','Analytics + Risk Flags','group','intelligence'),
      jsonb_build_object('id','migration','name','Migration Layer','group','ops'),
      jsonb_build_object('id','protection','name','Content Protection Layer','group','ops')
    )
  ),
  deadlines = jsonb_build_object(
    'milestones', jsonb_build_array(
      jsonb_build_object(
        'name','Pre-Test Ready',
        'due_on','2025-10-01',
        'must_haves', jsonb_build_array('Q-bank v1','Mock exam v1','Student portal v1','Stripe access flow'),
        'owners','Tai (lead) / Vendor A',
        'risks', jsonb_build_array('Content migration slip','Q-bank content authoring delay'),
        'fallback','Ship pre-test with reduced question bank; expand post-launch.',
        'can_wait', jsonb_build_array('School portal','Advanced analytics')
      ),
      jsonb_build_object(
        'name','First School Launch',
        'due_on','2026-01-01',
        'must_haves', jsonb_build_array('School portal v1','Cohort analytics','License management','Owner console'),
        'owners','Tai / Vendor B',
        'risks', jsonb_build_array('School contracting timeline','Multi-tenant readiness'),
        'fallback','Onboard first school on managed workspace before self-serve.',
        'can_wait', jsonb_build_array('Full DRM buildout','Advanced automation')
      )
    )
  ),
  investment = jsonb_build_object(
    'phases', jsonb_build_array(
      jsonb_build_object('name','Phase 1: Pre-Test Readiness','outcome','Students can practice, mock exam, and track readiness.','systems', jsonb_build_array('Student Portal','Q-Bank','Mock Exam','Stripe Access'),'timeline','Now → Oct 1, 2025','range','$45k – $65k','dependencies','Content migration complete','risks','Content authoring pace','exclusions','School portal, live classes'),
      jsonb_build_object('name','Phase 2: Core Platform Build','outcome','Institutional readiness with school portal and analytics.','systems', jsonb_build_array('School Portal','Cohort Analytics','License Management','Owner Console'),'timeline','Oct 2025 → Jan 1, 2026','range','$65k – $95k','dependencies','Phase 1 live','risks','School contracting cycle','exclusions','AI tutoring, DRM v2'),
      jsonb_build_object('name','Phase 3: Scale & Intelligence','outcome','AI-powered readiness engine and full growth stack.','systems', jsonb_build_array('AI Knowledge Layer','Risk Flags','Automation','Growth Engine'),'timeline','Q1–Q2 2026','range','$75k – $120k','dependencies','Phase 2 live, data pipeline in place','risks','Model accuracy on niche content','exclusions','White-label offering'))
  )
WHERE p.name = 'Mental Dental Academy';
