export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_access: {
        Row: {
          created_at: string | null
          email: string
          granted_at: string
          id: string
          metadata: Json | null
          revoked_at: string | null
          source: string
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          granted_at?: string
          id?: string
          metadata?: Json | null
          revoked_at?: string | null
          source?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          granted_at?: string
          id?: string
          metadata?: Json | null
          revoked_at?: string | null
          source?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      client_portal_activity: {
        Row: {
          actor_email: string | null
          actor_type: string
          client_visible: boolean
          created_at: string
          event_type: string
          id: string
          metadata: Json
          project_id: string
          summary: string
        }
        Insert: {
          actor_email?: string | null
          actor_type: string
          client_visible?: boolean
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          project_id: string
          summary: string
        }
        Update: {
          actor_email?: string | null
          actor_type?: string
          client_visible?: boolean
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          project_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_billing: {
        Row: {
          amount_total: number
          created_at: string
          currency: string
          id: string
          invoice_url: string | null
          metadata: Json
          next_payment_at: string | null
          payment_confirmed_at: string | null
          payment_status: string
          project_id: string
          purchased_package: string | null
          receipt_url: string | null
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_total?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          metadata?: Json
          next_payment_at?: string | null
          payment_confirmed_at?: string | null
          payment_status?: string
          project_id: string
          purchased_package?: string | null
          receipt_url?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_total?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          metadata?: Json
          next_payment_at?: string | null
          payment_confirmed_at?: string | null
          payment_status?: string
          project_id?: string
          purchased_package?: string | null
          receipt_url?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_billing_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_files: {
        Row: {
          bucket_id: string
          category: string
          client_visible: boolean
          created_at: string
          file_name: string
          file_type: string | null
          id: string
          is_internal: boolean
          linked_roadmap_document_id: string | null
          metadata: Json
          mime_type: string | null
          project_id: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by_email: string | null
          uploaded_by_role: string
        }
        Insert: {
          bucket_id?: string
          category?: string
          client_visible?: boolean
          created_at?: string
          file_name: string
          file_type?: string | null
          id?: string
          is_internal?: boolean
          linked_roadmap_document_id?: string | null
          metadata?: Json
          mime_type?: string | null
          project_id: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by_email?: string | null
          uploaded_by_role?: string
        }
        Update: {
          bucket_id?: string
          category?: string
          client_visible?: boolean
          created_at?: string
          file_name?: string
          file_type?: string | null
          id?: string
          is_internal?: boolean
          linked_roadmap_document_id?: string | null
          metadata?: Json
          mime_type?: string | null
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by_email?: string | null
          uploaded_by_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_files_linked_roadmap_document_id_fkey"
            columns: ["linked_roadmap_document_id"]
            isOneToOne: false
            referencedRelation: "roadmap_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_messages: {
        Row: {
          action_completed_at: string | null
          action_required: boolean
          author_email: string | null
          body: string
          created_at: string
          id: string
          message_type: string
          metadata: Json
          project_id: string
          related_file_ids: string[]
          related_roadmap_section: string | null
          sender_type: string
          subject: string | null
          updated_at: string
          visible_to_client: boolean
        }
        Insert: {
          action_completed_at?: string | null
          action_required?: boolean
          author_email?: string | null
          body: string
          created_at?: string
          id?: string
          message_type?: string
          metadata?: Json
          project_id: string
          related_file_ids?: string[]
          related_roadmap_section?: string | null
          sender_type: string
          subject?: string | null
          updated_at?: string
          visible_to_client?: boolean
        }
        Update: {
          action_completed_at?: string | null
          action_required?: boolean
          author_email?: string | null
          body?: string
          created_at?: string
          id?: string
          message_type?: string
          metadata?: Json
          project_id?: string
          related_file_ids?: string[]
          related_roadmap_section?: string | null
          sender_type?: string
          subject?: string | null
          updated_at?: string
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_onboarding: {
        Row: {
          assets_docs: Json
          business_basics: Json
          completion_percent: number
          created_at: string
          current_state: Json
          current_step: number
          goals_priorities: Json
          id: string
          last_saved_at: string | null
          project_id: string
          review_submit: Json
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assets_docs?: Json
          business_basics?: Json
          completion_percent?: number
          created_at?: string
          current_state?: Json
          current_step?: number
          goals_priorities?: Json
          id?: string
          last_saved_at?: string | null
          project_id: string
          review_submit?: Json
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assets_docs?: Json
          business_basics?: Json
          completion_percent?: number
          created_at?: string
          current_state?: Json
          current_step?: number
          goals_priorities?: Json
          id?: string
          last_saved_at?: string | null
          project_id?: string
          review_submit?: Json
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_onboarding_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_permissions: {
        Row: {
          can_message: boolean
          can_upload_files: boolean
          can_view_billing: boolean
          can_view_roadmap: boolean
          created_at: string
          email: string
          granted_at: string
          granted_by: string | null
          id: string
          project_id: string
          revoked_at: string | null
          role: string
          updated_at: string
        }
        Insert: {
          can_message?: boolean
          can_upload_files?: boolean
          can_view_billing?: boolean
          can_view_roadmap?: boolean
          created_at?: string
          email: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          project_id: string
          revoked_at?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          can_message?: boolean
          can_upload_files?: boolean
          can_view_billing?: boolean
          can_view_roadmap?: boolean
          created_at?: string
          email?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          project_id?: string
          revoked_at?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_projects: {
        Row: {
          access_granted_at: string | null
          access_revoked_at: string | null
          approved_roadmap_id: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          currency: string | null
          current_phase: string
          id: string
          intake_submission_id: string | null
          last_client_activity_at: string | null
          metadata: Json
          next_milestone: string | null
          next_milestone_due_at: string | null
          owner_email: string | null
          package_name: string | null
          payment_amount: number | null
          payment_status: string
          portal_status: string
          primary_email: string
          purchase_date: string | null
          purchased_package: string | null
          scheduling_url: string | null
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          access_granted_at?: string | null
          access_revoked_at?: string | null
          approved_roadmap_id?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string | null
          current_phase?: string
          id?: string
          intake_submission_id?: string | null
          last_client_activity_at?: string | null
          metadata?: Json
          next_milestone?: string | null
          next_milestone_due_at?: string | null
          owner_email?: string | null
          package_name?: string | null
          payment_amount?: number | null
          payment_status?: string
          portal_status?: string
          primary_email: string
          purchase_date?: string | null
          purchased_package?: string | null
          scheduling_url?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          access_granted_at?: string | null
          access_revoked_at?: string | null
          approved_roadmap_id?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string | null
          current_phase?: string
          id?: string
          intake_submission_id?: string | null
          last_client_activity_at?: string | null
          metadata?: Json
          next_milestone?: string | null
          next_milestone_due_at?: string | null
          owner_email?: string | null
          package_name?: string | null
          payment_amount?: number | null
          payment_status?: string
          portal_status?: string
          primary_email?: string
          purchase_date?: string | null
          purchased_package?: string | null
          scheduling_url?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_portal_roadmaps: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_email: string | null
          approved_at: string | null
          created_at: string
          current_diagnosis: string | null
          current_focus: string | null
          executive_summary: string | null
          id: string
          metadata: Json
          next_meeting_at: string | null
          next_milestone: string | null
          one_pager_file_id: string | null
          owner_name: string | null
          pdf_file_id: string | null
          project_id: string
          recommended_next_move: string | null
          risks_dependencies: Json
          roadmap_document_id: string | null
          sequence_30_60_90: Json
          share_url: string | null
          source_review_id: string | null
          source_submission_id: string | null
          status: string
          strategic_priorities: Json
          supporting_notes: string | null
          title: string
          updated_at: string
          version_label: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_email?: string | null
          approved_at?: string | null
          created_at?: string
          current_diagnosis?: string | null
          current_focus?: string | null
          executive_summary?: string | null
          id?: string
          metadata?: Json
          next_meeting_at?: string | null
          next_milestone?: string | null
          one_pager_file_id?: string | null
          owner_name?: string | null
          pdf_file_id?: string | null
          project_id: string
          recommended_next_move?: string | null
          risks_dependencies?: Json
          roadmap_document_id?: string | null
          sequence_30_60_90?: Json
          share_url?: string | null
          source_review_id?: string | null
          source_submission_id?: string | null
          status?: string
          strategic_priorities?: Json
          supporting_notes?: string | null
          title: string
          updated_at?: string
          version_label?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_email?: string | null
          approved_at?: string | null
          created_at?: string
          current_diagnosis?: string | null
          current_focus?: string | null
          executive_summary?: string | null
          id?: string
          metadata?: Json
          next_meeting_at?: string | null
          next_milestone?: string | null
          one_pager_file_id?: string | null
          owner_name?: string | null
          pdf_file_id?: string | null
          project_id?: string
          recommended_next_move?: string | null
          risks_dependencies?: Json
          roadmap_document_id?: string | null
          sequence_30_60_90?: Json
          share_url?: string | null
          source_review_id?: string | null
          source_submission_id?: string | null
          status?: string
          strategic_priorities?: Json
          supporting_notes?: string | null
          title?: string
          updated_at?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_roadmaps_one_pager_file_id_fkey"
            columns: ["one_pager_file_id"]
            isOneToOne: false
            referencedRelation: "client_portal_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_roadmaps_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "client_portal_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_roadmaps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_roadmaps_roadmap_document_id_fkey"
            columns: ["roadmap_document_id"]
            isOneToOne: false
            referencedRelation: "roadmap_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      engine_activity: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          project_id: string | null
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          project_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_agent_tasks: {
        Row: {
          attached_source_ids: string[]
          confidence: number
          cost_cents: number
          created_at: string
          created_by_email: string | null
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["engine_agent_task_kind"]
          output: string | null
          project_id: string
          prompt: string
          related_module: string | null
          status: Database["public"]["Enums"]["engine_agent_task_status"]
          tokens_in: number
          tokens_out: number
          updated_at: string
          used_project_context: boolean
        }
        Insert: {
          attached_source_ids?: string[]
          confidence?: number
          cost_cents?: number
          created_at?: string
          created_by_email?: string | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["engine_agent_task_kind"]
          output?: string | null
          project_id: string
          prompt: string
          related_module?: string | null
          status?: Database["public"]["Enums"]["engine_agent_task_status"]
          tokens_in?: number
          tokens_out?: number
          updated_at?: string
          used_project_context?: boolean
        }
        Update: {
          attached_source_ids?: string[]
          confidence?: number
          cost_cents?: number
          created_at?: string
          created_by_email?: string | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["engine_agent_task_kind"]
          output?: string | null
          project_id?: string
          prompt?: string
          related_module?: string | null
          status?: Database["public"]["Enums"]["engine_agent_task_status"]
          tokens_in?: number
          tokens_out?: number
          updated_at?: string
          used_project_context?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "engine_agent_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_change_events: {
        Row: {
          affected_module: string | null
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["engine_change_kind"]
          project_id: string
          resolved_at: string | null
          severity: string
          source_id: string | null
          title: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          affected_module?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["engine_change_kind"]
          project_id: string
          resolved_at?: string | null
          severity?: string
          source_id?: string | null
          title: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          affected_module?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["engine_change_kind"]
          project_id?: string
          resolved_at?: string | null
          severity?: string
          source_id?: string | null
          title?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_change_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_change_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "engine_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_change_events_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_clients: {
        Row: {
          company: string
          contact_email: string | null
          created_at: string
          id: string
          industry: string | null
          notes: string | null
          owner_email: string | null
          primary_contact: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company: string
          contact_email?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          notes?: string | null
          owner_email?: string | null
          primary_contact?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          notes?: string | null
          owner_email?: string | null
          primary_contact?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      engine_project_dates: {
        Row: {
          created_at: string
          due_on: string
          id: string
          kind: string
          label: string
          project_id: string
        }
        Insert: {
          created_at?: string
          due_on: string
          id?: string
          kind?: string
          label: string
          project_id: string
        }
        Update: {
          created_at?: string
          due_on?: string
          id?: string
          kind?: string
          label?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_dates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_projects: {
        Row: {
          agent_allowed_modules: string[]
          agent_budget_monthly_cents: number
          agent_permission_level: Database["public"]["Enums"]["engine_agent_permission"]
          agent_safety_rules: Json
          agent_spend_month_cents: number
          agent_status: string
          approved_version: string | null
          blueprint: Json
          client_id: string
          client_preview: Json
          created_at: string
          current_step: string
          current_step_num: number
          deadlines: Json
          delivery: Json
          extraction: Json
          gap_map: Json
          health_score: number
          hidden_assets: Json
          id: string
          investment: Json
          last_activity_at: string
          name: string
          next_action: string | null
          open_decisions: number
          point_a: Json
          point_b: Json
          progress_pct: number
          roadmap: Json
          roadmap_version: string | null
          sequencing: Json
          signal_room: Json
          status: Database["public"]["Enums"]["engine_project_status"]
          updated_at: string
        }
        Insert: {
          agent_allowed_modules?: string[]
          agent_budget_monthly_cents?: number
          agent_permission_level?: Database["public"]["Enums"]["engine_agent_permission"]
          agent_safety_rules?: Json
          agent_spend_month_cents?: number
          agent_status?: string
          approved_version?: string | null
          blueprint?: Json
          client_id: string
          client_preview?: Json
          created_at?: string
          current_step?: string
          current_step_num?: number
          deadlines?: Json
          delivery?: Json
          extraction?: Json
          gap_map?: Json
          health_score?: number
          hidden_assets?: Json
          id?: string
          investment?: Json
          last_activity_at?: string
          name: string
          next_action?: string | null
          open_decisions?: number
          point_a?: Json
          point_b?: Json
          progress_pct?: number
          roadmap?: Json
          roadmap_version?: string | null
          sequencing?: Json
          signal_room?: Json
          status?: Database["public"]["Enums"]["engine_project_status"]
          updated_at?: string
        }
        Update: {
          agent_allowed_modules?: string[]
          agent_budget_monthly_cents?: number
          agent_permission_level?: Database["public"]["Enums"]["engine_agent_permission"]
          agent_safety_rules?: Json
          agent_spend_month_cents?: number
          agent_status?: string
          approved_version?: string | null
          blueprint?: Json
          client_id?: string
          client_preview?: Json
          created_at?: string
          current_step?: string
          current_step_num?: number
          deadlines?: Json
          delivery?: Json
          extraction?: Json
          gap_map?: Json
          health_score?: number
          hidden_assets?: Json
          id?: string
          investment?: Json
          last_activity_at?: string
          name?: string
          next_action?: string | null
          open_decisions?: number
          point_a?: Json
          point_b?: Json
          progress_pct?: number
          roadmap?: Json
          roadmap_version?: string | null
          sequencing?: Json
          signal_room?: Json
          status?: Database["public"]["Enums"]["engine_project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "engine_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_roadmap_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          payload: Json
          project_id: string
          source_ids: string[]
          status: Database["public"]["Enums"]["engine_version_status"]
          summary: string | null
          updated_at: string
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          payload?: Json
          project_id: string
          source_ids?: string[]
          status?: Database["public"]["Enums"]["engine_version_status"]
          summary?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          payload?: Json
          project_id?: string
          source_ids?: string[]
          status?: Database["public"]["Enums"]["engine_version_status"]
          summary?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_roadmap_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_signals: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          received_at: string
          source: string | null
          summary: string
          triaged: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          received_at?: string
          source?: string | null
          summary: string
          triaged?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          received_at?: string
          source?: string | null
          summary?: string
          triaged?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "engine_signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_sources: {
        Row: {
          confidence: number
          created_at: string
          created_by_email: string | null
          error: string | null
          id: string
          name: string
          project_id: string
          raw_text: string | null
          signals_count: number
          status: Database["public"]["Enums"]["engine_source_status"]
          storage_path: string | null
          type: Database["public"]["Enums"]["engine_source_type"]
          updated_at: string
          url: string | null
          used_in_version: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by_email?: string | null
          error?: string | null
          id?: string
          name: string
          project_id: string
          raw_text?: string | null
          signals_count?: number
          status?: Database["public"]["Enums"]["engine_source_status"]
          storage_path?: string | null
          type: Database["public"]["Enums"]["engine_source_type"]
          updated_at?: string
          url?: string | null
          used_in_version?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by_email?: string | null
          error?: string | null
          id?: string
          name?: string
          project_id?: string
          raw_text?: string | null
          signals_count?: number
          status?: Database["public"]["Enums"]["engine_source_status"]
          storage_path?: string | null
          type?: Database["public"]["Enums"]["engine_source_type"]
          updated_at?: string
          url?: string | null
          used_in_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_drafts: {
        Row: {
          answers: Json
          contact: Json
          resume_token: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          contact?: Json
          resume_token?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          contact?: Json
          resume_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      intake_submissions: {
        Row: {
          answers: Json
          authorizes_scan: boolean
          business: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          source: string
          status: string
          website: string | null
        }
        Insert: {
          answers?: Json
          authorizes_scan?: boolean
          business?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          source?: string
          status?: string
          website?: string | null
        }
        Update: {
          answers?: Json
          authorizes_scan?: boolean
          business?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          source?: string
          status?: string
          website?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_total: number
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          environment: string
          id: string
          metadata: Json
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          updated_at: string
        }
        Insert: {
          amount_total?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          environment?: string
          id?: string
          metadata?: Json
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          updated_at?: string
        }
        Update: {
          amount_total?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          environment?: string
          id?: string
          metadata?: Json
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_access_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          email: string | null
          event_type: string
          has_client_access: boolean | null
          has_permission: boolean | null
          has_project: boolean | null
          id: string
          metadata: Json
          project_id: string | null
          route: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          email?: string | null
          event_type: string
          has_client_access?: boolean | null
          has_permission?: boolean | null
          has_project?: boolean | null
          id?: string
          metadata?: Json
          project_id?: string | null
          route?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          email?: string | null
          event_type?: string
          has_client_access?: boolean | null
          has_permission?: boolean | null
          has_project?: boolean | null
          id?: string
          metadata?: Json
          project_id?: string | null
          route?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      portal_messages: {
        Row: {
          body: string
          client_email: string
          created_at: string
          id: string
          sender: string
        }
        Insert: {
          body: string
          client_email: string
          created_at?: string
          id?: string
          sender: string
        }
        Update: {
          body?: string
          client_email?: string
          created_at?: string
          id?: string
          sender?: string
        }
        Relationships: []
      }
      processed_stripe_events: {
        Row: {
          environment: string
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          environment: string
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          environment?: string
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      roadmap_documents: {
        Row: {
          body_md: string | null
          client_email: string
          created_at: string | null
          file_url: string | null
          id: string
          published_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          body_md?: string | null
          client_email: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          published_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          body_md?: string | null
          client_email?: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          published_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          customer_email: string | null
          environment: string
          id: string
          metadata: Json | null
          pause_collection: string | null
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email?: string | null
          environment?: string
          id?: string
          metadata?: Json | null
          pause_collection?: string | null
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email?: string | null
          environment?: string
          id?: string
          metadata?: Json | null
          pause_collection?: string | null
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          email: string
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string | null
        }
        Insert: {
          email: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Update: {
          email?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_grant_role: {
        Args: { _email: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: string
      }
      admin_list_user_roles: {
        Args: never
        Returns: {
          email: string
          granted_at: string
          granted_by: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_revoke_role: {
        Args: { _email: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
      client_portal_is_operator: { Args: { _email: string }; Returns: boolean }
      current_client_portal_project_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_client_access: { Args: { _email: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_email: {
        Args: { _email: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      log_client_portal_activity: {
        Args: {
          _actor_email: string
          _actor_type: string
          _client_visible?: boolean
          _event_type: string
          _metadata?: Json
          _project_id: string
          _summary: string
        }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      sync_client_access_user: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "operator" | "user"
      engine_agent_permission:
        | "draft_only"
        | "propose_updates"
        | "execute_approved"
      engine_agent_task_kind:
        | "milestone_brief"
        | "acceptance_criteria"
        | "lovable_prompt"
        | "missing_decisions"
        | "update_from_source"
        | "version_compare"
        | "risk_estimate"
        | "client_summary"
        | "qa_checklist"
        | "free_form"
      engine_agent_task_status:
        | "draft"
        | "applied"
        | "saved_as_task"
        | "rejected"
      engine_change_kind:
        | "new_info"
        | "conflict"
        | "opportunity"
        | "risk"
        | "deadline_change"
        | "scope_change"
        | "investment_impact"
        | "client_copy_affected"
      engine_project_status:
        | "active"
        | "draft"
        | "needs_review"
        | "approved"
        | "delivered"
        | "in_execution"
        | "blocked"
        | "archived"
      engine_source_status: "queued" | "processing" | "processed" | "failed"
      engine_source_type:
        | "transcript"
        | "brief"
        | "website_url"
        | "document"
        | "screenshot"
        | "email_note"
        | "research_note"
        | "competitor_url"
        | "previous_roadmap"
      engine_version_status:
        | "ai_generated"
        | "draft"
        | "needs_review"
        | "tai_edited"
        | "approved"
        | "client_facing"
        | "delivered"
        | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operator", "user"],
      engine_agent_permission: [
        "draft_only",
        "propose_updates",
        "execute_approved",
      ],
      engine_agent_task_kind: [
        "milestone_brief",
        "acceptance_criteria",
        "lovable_prompt",
        "missing_decisions",
        "update_from_source",
        "version_compare",
        "risk_estimate",
        "client_summary",
        "qa_checklist",
        "free_form",
      ],
      engine_agent_task_status: [
        "draft",
        "applied",
        "saved_as_task",
        "rejected",
      ],
      engine_change_kind: [
        "new_info",
        "conflict",
        "opportunity",
        "risk",
        "deadline_change",
        "scope_change",
        "investment_impact",
        "client_copy_affected",
      ],
      engine_project_status: [
        "active",
        "draft",
        "needs_review",
        "approved",
        "delivered",
        "in_execution",
        "blocked",
        "archived",
      ],
      engine_source_status: ["queued", "processing", "processed", "failed"],
      engine_source_type: [
        "transcript",
        "brief",
        "website_url",
        "document",
        "screenshot",
        "email_note",
        "research_note",
        "competitor_url",
        "previous_roadmap",
      ],
      engine_version_status: [
        "ai_generated",
        "draft",
        "needs_review",
        "tai_edited",
        "approved",
        "client_facing",
        "delivered",
        "archived",
      ],
    },
  },
} as const
