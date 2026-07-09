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
          {
            foreignKeyName: "client_portal_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
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
          {
            foreignKeyName: "client_portal_billing_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_files: {
        Row: {
          approved_at: string | null
          approved_by_email: string | null
          bucket_id: string
          category: string
          client_visible: boolean
          created_at: string
          download_count: number
          file_name: string
          file_type: string | null
          id: string
          is_internal: boolean
          last_downloaded_at: string | null
          last_viewed_at: string | null
          linked_roadmap_document_id: string | null
          metadata: Json
          mime_type: string | null
          project_id: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by_email: string | null
          uploaded_by_role: string
          view_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by_email?: string | null
          bucket_id?: string
          category?: string
          client_visible?: boolean
          created_at?: string
          download_count?: number
          file_name: string
          file_type?: string | null
          id?: string
          is_internal?: boolean
          last_downloaded_at?: string | null
          last_viewed_at?: string | null
          linked_roadmap_document_id?: string | null
          metadata?: Json
          mime_type?: string | null
          project_id: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by_email?: string | null
          uploaded_by_role?: string
          view_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by_email?: string | null
          bucket_id?: string
          category?: string
          client_visible?: boolean
          created_at?: string
          download_count?: number
          file_name?: string
          file_type?: string | null
          id?: string
          is_internal?: boolean
          last_downloaded_at?: string | null
          last_viewed_at?: string | null
          linked_roadmap_document_id?: string | null
          metadata?: Json
          mime_type?: string | null
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by_email?: string | null
          uploaded_by_role?: string
          view_count?: number
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
          {
            foreignKeyName: "client_portal_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
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
          related_decision_id: string | null
          related_deliverable_id: string | null
          related_file_ids: string[]
          related_milestone_id: string | null
          related_phase_id: string | null
          related_project_id: string | null
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
          related_decision_id?: string | null
          related_deliverable_id?: string | null
          related_file_ids?: string[]
          related_milestone_id?: string | null
          related_phase_id?: string | null
          related_project_id?: string | null
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
          related_decision_id?: string | null
          related_deliverable_id?: string | null
          related_file_ids?: string[]
          related_milestone_id?: string | null
          related_phase_id?: string | null
          related_project_id?: string | null
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
          {
            foreignKeyName: "client_portal_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
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
          {
            foreignKeyName: "client_portal_onboarding_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "portal_project_v"
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
          {
            foreignKeyName: "client_portal_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
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
          approved_roadmap_version_id: string | null
          client_safe_canvas: Json
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
          published_at: string | null
          published_by: string | null
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
          visible_modules: Json
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_email?: string | null
          approved_at?: string | null
          approved_roadmap_version_id?: string | null
          client_safe_canvas?: Json
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
          published_at?: string | null
          published_by?: string | null
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
          visible_modules?: Json
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_email?: string | null
          approved_at?: string | null
          approved_roadmap_version_id?: string | null
          client_safe_canvas?: Json
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
          published_at?: string | null
          published_by?: string | null
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
          visible_modules?: Json
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
            foreignKeyName: "client_portal_roadmaps_one_pager_file_id_fkey"
            columns: ["one_pager_file_id"]
            isOneToOne: false
            referencedRelation: "portal_files_v"
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
            foreignKeyName: "client_portal_roadmaps_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "portal_files_v"
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
            foreignKeyName: "client_portal_roadmaps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_roadmaps_roadmap_document_id_fkey"
            columns: ["roadmap_document_id"]
            isOneToOne: false
            referencedRelation: "roadmap_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_roadmaps_source_version_id_fkey"
            columns: ["approved_roadmap_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
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
      engine_agent_costs: {
        Row: {
          actor_email: string | null
          agent_task_id: string | null
          category: string | null
          cost_cents: number
          created_at: string
          id: string
          kind: string
          metadata: Json
          model: string | null
          project_id: string
          related_module: string | null
          roadmap_version_id: string | null
          status: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          actor_email?: string | null
          agent_task_id?: string | null
          category?: string | null
          cost_cents?: number
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          model?: string | null
          project_id: string
          related_module?: string | null
          roadmap_version_id?: string | null
          status?: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          actor_email?: string | null
          agent_task_id?: string | null
          category?: string | null
          cost_cents?: number
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          model?: string | null
          project_id?: string
          related_module?: string | null
          roadmap_version_id?: string | null
          status?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "engine_agent_costs_agent_task_id_fkey"
            columns: ["agent_task_id"]
            isOneToOne: false
            referencedRelation: "engine_agent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_agent_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_agent_costs_roadmap_version_id_fkey"
            columns: ["roadmap_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_agent_permissions: {
        Row: {
          action_permissions: Json
          auto_pause_when_exceeded: boolean | null
          hard_stop_pct: number | null
          monthly_cap_cents: number | null
          permission_mode: string
          preferred_model: string | null
          project_id: string
          require_approval_above_cents: number | null
          safety_rules: Json
          updated_at: string
          warning_threshold_pct: number | null
        }
        Insert: {
          action_permissions?: Json
          auto_pause_when_exceeded?: boolean | null
          hard_stop_pct?: number | null
          monthly_cap_cents?: number | null
          permission_mode?: string
          preferred_model?: string | null
          project_id: string
          require_approval_above_cents?: number | null
          safety_rules?: Json
          updated_at?: string
          warning_threshold_pct?: number | null
        }
        Update: {
          action_permissions?: Json
          auto_pause_when_exceeded?: boolean | null
          hard_stop_pct?: number | null
          monthly_cap_cents?: number | null
          permission_mode?: string
          preferred_model?: string | null
          project_id?: string
          require_approval_above_cents?: number | null
          safety_rules?: Json
          updated_at?: string
          warning_threshold_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_agent_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_agent_tasks: {
        Row: {
          applied_at: string | null
          applied_module: string | null
          attached_source_ids: string[]
          category: string | null
          confidence: number
          cost_cents: number
          created_at: string
          created_by_email: string | null
          created_by_kind: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["engine_agent_task_kind"]
          output: string | null
          pending_approval: boolean
          project_id: string
          prompt: string
          related_module: string | null
          roadmap_version_id: string | null
          status: Database["public"]["Enums"]["engine_agent_task_status"]
          tokens_in: number
          tokens_out: number
          updated_at: string
          used_project_context: boolean
        }
        Insert: {
          applied_at?: string | null
          applied_module?: string | null
          attached_source_ids?: string[]
          category?: string | null
          confidence?: number
          cost_cents?: number
          created_at?: string
          created_by_email?: string | null
          created_by_kind?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["engine_agent_task_kind"]
          output?: string | null
          pending_approval?: boolean
          project_id: string
          prompt: string
          related_module?: string | null
          roadmap_version_id?: string | null
          status?: Database["public"]["Enums"]["engine_agent_task_status"]
          tokens_in?: number
          tokens_out?: number
          updated_at?: string
          used_project_context?: boolean
        }
        Update: {
          applied_at?: string | null
          applied_module?: string | null
          attached_source_ids?: string[]
          category?: string | null
          confidence?: number
          cost_cents?: number
          created_at?: string
          created_by_email?: string | null
          created_by_kind?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["engine_agent_task_kind"]
          output?: string | null
          pending_approval?: boolean
          project_id?: string
          prompt?: string
          related_module?: string | null
          roadmap_version_id?: string | null
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
          {
            foreignKeyName: "engine_agent_tasks_roadmap_version_id_fkey"
            columns: ["roadmap_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          affected_modules: string[]
          created_at: string
          field_changed: string | null
          id: string
          metadata: Json
          new_value: Json | null
          old_value: Json | null
          project_id: string
          reason: string | null
          summary: string | null
          target_id: string | null
          version_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          affected_modules?: string[]
          created_at?: string
          field_changed?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          project_id: string
          reason?: string | null
          summary?: string | null
          target_id?: string | null
          version_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          affected_modules?: string[]
          created_at?: string
          field_changed?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          project_id?: string
          reason?: string | null
          summary?: string | null
          target_id?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_audit_log_project_id_fkey"
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
      engine_delivery_history: {
        Row: {
          actor: string | null
          at: string
          delivery_id: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          actor?: string | null
          at?: string
          delivery_id: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          actor?: string | null
          at?: string
          delivery_id?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_delivery_history_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "engine_delivery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_delivery_items: {
        Row: {
          approved_by: string | null
          channel: string
          client: string
          client_acknowledged_at: string | null
          client_acknowledged_by_email: string | null
          client_downloaded_at: string | null
          client_portal_roadmap_id: string | null
          client_viewed_at: string | null
          created_at: string
          id: string
          last_action: string | null
          prepared_by: string | null
          project_id: string | null
          recipient: string | null
          recipient_role: string | null
          roadmap: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          approved_by?: string | null
          channel?: string
          client: string
          client_acknowledged_at?: string | null
          client_acknowledged_by_email?: string | null
          client_downloaded_at?: string | null
          client_portal_roadmap_id?: string | null
          client_viewed_at?: string | null
          created_at?: string
          id?: string
          last_action?: string | null
          prepared_by?: string | null
          project_id?: string | null
          recipient?: string | null
          recipient_role?: string | null
          roadmap: string
          status?: string
          updated_at?: string
          version?: string
        }
        Update: {
          approved_by?: string | null
          channel?: string
          client?: string
          client_acknowledged_at?: string | null
          client_acknowledged_by_email?: string | null
          client_downloaded_at?: string | null
          client_portal_roadmap_id?: string | null
          client_viewed_at?: string | null
          created_at?: string
          id?: string
          last_action?: string | null
          prepared_by?: string | null
          project_id?: string | null
          recipient?: string | null
          recipient_role?: string | null
          roadmap?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_delivery_items_client_portal_roadmap_id_fkey"
            columns: ["client_portal_roadmap_id"]
            isOneToOne: false
            referencedRelation: "client_portal_roadmaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_delivery_items_client_portal_roadmap_id_fkey"
            columns: ["client_portal_roadmap_id"]
            isOneToOne: false
            referencedRelation: "portal_roadmaps_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_delivery_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_extracted_signals: {
        Row: {
          category: Database["public"]["Enums"]["engine_signal_category"]
          client_safe: boolean
          confidence: number
          created_at: string
          detail: string | null
          extraction_run_id: string | null
          id: string
          label: string
          metadata: Json
          project_id: string
          source_id: string | null
          updated_at: string
          used_in_version_id: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["engine_signal_category"]
          client_safe?: boolean
          confidence?: number
          created_at?: string
          detail?: string | null
          extraction_run_id?: string | null
          id?: string
          label: string
          metadata?: Json
          project_id: string
          source_id?: string | null
          updated_at?: string
          used_in_version_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["engine_signal_category"]
          client_safe?: boolean
          confidence?: number
          created_at?: string
          detail?: string | null
          extraction_run_id?: string | null
          id?: string
          label?: string
          metadata?: Json
          project_id?: string
          source_id?: string | null
          updated_at?: string
          used_in_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_extracted_signals_extraction_run_id_fkey"
            columns: ["extraction_run_id"]
            isOneToOne: false
            referencedRelation: "engine_extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_extracted_signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_extracted_signals_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "engine_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_extracted_signals_used_in_version_id_fkey"
            columns: ["used_in_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_extraction_runs: {
        Row: {
          cost_cents: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          intake_summary: string | null
          metadata: Json
          model_intake: string | null
          model_structured: string | null
          produced_version_id: string | null
          project_id: string
          provider_intake: string | null
          provider_structured: string | null
          signals_count: number
          source_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["engine_extraction_run_status"]
          updated_at: string
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          intake_summary?: string | null
          metadata?: Json
          model_intake?: string | null
          model_structured?: string | null
          produced_version_id?: string | null
          project_id: string
          provider_intake?: string | null
          provider_structured?: string | null
          signals_count?: number
          source_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["engine_extraction_run_status"]
          updated_at?: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          intake_summary?: string | null
          metadata?: Json
          model_intake?: string | null
          model_structured?: string | null
          produced_version_id?: string | null
          project_id?: string
          provider_intake?: string | null
          provider_structured?: string | null
          signals_count?: number
          source_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["engine_extraction_run_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_extraction_runs_produced_version_id_fkey"
            columns: ["produced_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_extraction_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_extraction_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "engine_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_intelligence_decisions: {
        Row: {
          action: string
          actor_email: string
          actor_user_id: string | null
          after_state: Json
          before_state: Json
          created_at: string
          id: string
          memory_id: string | null
          notes: string | null
          project_id: string | null
        }
        Insert: {
          action: string
          actor_email: string
          actor_user_id?: string | null
          after_state?: Json
          before_state?: Json
          created_at?: string
          id?: string
          memory_id?: string | null
          notes?: string | null
          project_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          actor_user_id?: string | null
          after_state?: Json
          before_state?: Json
          created_at?: string
          id?: string
          memory_id?: string | null
          notes?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_intelligence_decisions_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "engine_intelligence_memory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_intelligence_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_intelligence_memory: {
        Row: {
          archived_at: string | null
          captured_at: string
          confidence: number
          created_at: string
          id: string
          milestone_id: string | null
          module_ref: string | null
          project_id: string | null
          promoted_by: string | null
          signal_id: string | null
          source: string | null
          source_date: string | null
          source_id: string | null
          summary: string | null
          tags: string[]
          title: string
          type: string
          updated_at: string
          used_in: string | null
        }
        Insert: {
          archived_at?: string | null
          captured_at?: string
          confidence?: number
          created_at?: string
          id?: string
          milestone_id?: string | null
          module_ref?: string | null
          project_id?: string | null
          promoted_by?: string | null
          signal_id?: string | null
          source?: string | null
          source_date?: string | null
          source_id?: string | null
          summary?: string | null
          tags?: string[]
          title: string
          type?: string
          updated_at?: string
          used_in?: string | null
        }
        Update: {
          archived_at?: string | null
          captured_at?: string
          confidence?: number
          created_at?: string
          id?: string
          milestone_id?: string | null
          module_ref?: string | null
          project_id?: string | null
          promoted_by?: string | null
          signal_id?: string | null
          source?: string | null
          source_date?: string | null
          source_id?: string | null
          summary?: string | null
          tags?: string[]
          title?: string
          type?: string
          updated_at?: string
          used_in?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_intelligence_memory_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "engine_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_intelligence_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_intelligence_memory_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "engine_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_intelligence_memory_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "engine_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_milestones: {
        Row: {
          acceptance_criteria: Json
          approval_status: string
          approved_at: string | null
          approved_by_email: string | null
          brief_md: string | null
          client_safe_md: string | null
          confidence: number | null
          created_at: string
          created_by_kind: string
          deadline_relevance: string | null
          decisions: Json
          dependencies: Json
          developer_prompt: string | null
          due_date: string | null
          estimated_cost_cents: number | null
          estimated_effort: string | null
          id: string
          name: string
          owner_email: string | null
          phase: string | null
          priority: string | null
          project_id: string
          qa_checklist: Json
          related_gap: string | null
          related_hidden_asset: string | null
          related_system_node: string | null
          risks: Json
          roadmap_version_id: string | null
          sort_index: number | null
          source_evidence: Json
          status: string
          updated_at: string
        }
        Insert: {
          acceptance_criteria?: Json
          approval_status?: string
          approved_at?: string | null
          approved_by_email?: string | null
          brief_md?: string | null
          client_safe_md?: string | null
          confidence?: number | null
          created_at?: string
          created_by_kind?: string
          deadline_relevance?: string | null
          decisions?: Json
          dependencies?: Json
          developer_prompt?: string | null
          due_date?: string | null
          estimated_cost_cents?: number | null
          estimated_effort?: string | null
          id?: string
          name: string
          owner_email?: string | null
          phase?: string | null
          priority?: string | null
          project_id: string
          qa_checklist?: Json
          related_gap?: string | null
          related_hidden_asset?: string | null
          related_system_node?: string | null
          risks?: Json
          roadmap_version_id?: string | null
          sort_index?: number | null
          source_evidence?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: Json
          approval_status?: string
          approved_at?: string | null
          approved_by_email?: string | null
          brief_md?: string | null
          client_safe_md?: string | null
          confidence?: number | null
          created_at?: string
          created_by_kind?: string
          deadline_relevance?: string | null
          decisions?: Json
          dependencies?: Json
          developer_prompt?: string | null
          due_date?: string | null
          estimated_cost_cents?: number | null
          estimated_effort?: string | null
          id?: string
          name?: string
          owner_email?: string | null
          phase?: string | null
          priority?: string | null
          project_id?: string
          qa_checklist?: Json
          related_gap?: string | null
          related_hidden_asset?: string | null
          related_system_node?: string | null
          risks?: Json
          roadmap_version_id?: string | null
          sort_index?: number | null
          source_evidence?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_milestones_roadmap_version_id_fkey"
            columns: ["roadmap_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_project_agents: {
        Row: {
          approval_pct: number | null
          created_at: string
          health: string
          id: string
          last_active_at: string | null
          model: string | null
          monthly_budget_cents: number
          name: string
          policy: string
          project_id: string | null
          spend_month_cents: number
          status: string
          tasks_count: number
          template: string | null
          updated_at: string
        }
        Insert: {
          approval_pct?: number | null
          created_at?: string
          health?: string
          id?: string
          last_active_at?: string | null
          model?: string | null
          monthly_budget_cents?: number
          name: string
          policy?: string
          project_id?: string | null
          spend_month_cents?: number
          status?: string
          tasks_count?: number
          template?: string | null
          updated_at?: string
        }
        Update: {
          approval_pct?: number | null
          created_at?: string
          health?: string
          id?: string
          last_active_at?: string | null
          model?: string | null
          monthly_budget_cents?: number
          name?: string
          policy?: string
          project_id?: string | null
          spend_month_cents?: number
          status?: string
          tasks_count?: number
          template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_project_artifacts: {
        Row: {
          artifact_type: string
          created_at: string
          created_by_email: string | null
          created_by_user_id: string | null
          id: string
          payload: Json
          project_id: string
          source_proposal_id: string | null
          status: string
          summary: string | null
          thread_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          artifact_type: string
          created_at?: string
          created_by_email?: string | null
          created_by_user_id?: string | null
          id?: string
          payload?: Json
          project_id: string
          source_proposal_id?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          artifact_type?: string
          created_at?: string
          created_by_email?: string | null
          created_by_user_id?: string | null
          id?: string
          payload?: Json
          project_id?: string
          source_proposal_id?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_project_artifacts_source_proposal_id_fkey"
            columns: ["source_proposal_id"]
            isOneToOne: false
            referencedRelation: "engine_project_chat_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_project_chat_events: {
        Row: {
          cost_cents: number
          created_at: string
          error_code: string | null
          error_message: string | null
          event_type: string | null
          id: string
          latency_ms: number | null
          message_id: string | null
          model: string | null
          project_id: string
          provider: string | null
          success: boolean
          thread_id: string | null
          tokens_in: number
          tokens_out: number
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          model?: string | null
          project_id: string
          provider?: string | null
          success?: boolean
          thread_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          cost_cents?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          model?: string | null
          project_id?: string
          provider?: string | null
          success?: boolean
          thread_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_chat_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_project_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json
          project_id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          project_id: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_project_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "engine_project_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_project_chat_proposals: {
        Row: {
          converted_ref: Json
          created_at: string
          created_by: string | null
          id: string
          payload: Json
          project_id: string
          proposal_type: string
          source_message_id: string | null
          status: string
          summary: string | null
          target_route: string | null
          thread_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          converted_ref?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          project_id: string
          proposal_type: string
          source_message_id?: string | null
          status?: string
          summary?: string | null
          target_route?: string | null
          thread_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          converted_ref?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          project_id?: string
          proposal_type?: string
          source_message_id?: string | null
          status?: string
          summary?: string | null
          target_route?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_chat_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_project_chat_proposals_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "engine_project_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_project_chat_proposals_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "engine_project_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_project_chat_threads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_chat_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
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
      engine_project_frames: {
        Row: {
          approved_at: string | null
          approved_by_email: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_email: string | null
          created_by_user_id: string | null
          generated_by: string
          id: string
          payload: Json
          project_id: string
          source_artifact_id: string | null
          source_version_id: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_email?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_user_id?: string | null
          generated_by?: string
          id?: string
          payload?: Json
          project_id: string
          source_artifact_id?: string | null
          source_version_id?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_email?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_user_id?: string | null
          generated_by?: string
          id?: string
          payload?: Json
          project_id?: string
          source_artifact_id?: string | null
          source_version_id?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_frames_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_project_frames_source_artifact_id_fkey"
            columns: ["source_artifact_id"]
            isOneToOne: false
            referencedRelation: "engine_project_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_project_frames_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_project_intake_failures: {
        Row: {
          actor_email: string | null
          attempted_client_id: string | null
          attempted_project_id: string | null
          attempted_project_name: string | null
          created_at: string
          delivery_mode: string | null
          failure_reason: string
          id: string
          payload: Json
        }
        Insert: {
          actor_email?: string | null
          attempted_client_id?: string | null
          attempted_project_id?: string | null
          attempted_project_name?: string | null
          created_at?: string
          delivery_mode?: string | null
          failure_reason: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_email?: string | null
          attempted_client_id?: string | null
          attempted_project_id?: string | null
          attempted_project_name?: string | null
          created_at?: string
          delivery_mode?: string | null
          failure_reason?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      engine_project_mockups: {
        Row: {
          approved_at: string | null
          approved_by_email: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_email: string | null
          created_by_user_id: string | null
          frame_id: string | null
          generated_by: string
          id: string
          payload: Json
          project_id: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_email?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_user_id?: string | null
          frame_id?: string | null
          generated_by?: string
          id?: string
          payload?: Json
          project_id: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_email?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_user_id?: string | null
          frame_id?: string | null
          generated_by?: string
          id?: string
          payload?: Json
          project_id?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_project_mockups_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "engine_project_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_project_mockups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_projects: {
        Row: {
          action_mode_enabled: boolean
          action_mode_updated_at: string | null
          action_mode_updated_by: string | null
          agent_allowed_modules: string[]
          agent_budget_monthly_cents: number
          agent_permission_level: Database["public"]["Enums"]["engine_agent_permission"]
          agent_safety_rules: Json
          agent_spend_month_cents: number
          agent_status: string
          approved_at: string | null
          approved_by_email: string | null
          approved_snapshot: Json
          approved_version: string | null
          blueprint: Json
          client_id: string
          client_portal_project_id: string | null
          client_preview: Json
          created_at: string
          current_step: string
          current_step_num: number
          deadlines: Json
          delivery: Json
          delivery_mode: Database["public"]["Enums"]["engine_delivery_mode"]
          extraction: Json
          gap_map: Json
          health_score: number
          hidden_assets: Json
          id: string
          investment: Json
          investment_confirmed_at: string | null
          investment_confirmed_by: string | null
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
          step_states: Json
          updated_at: string
        }
        Insert: {
          action_mode_enabled?: boolean
          action_mode_updated_at?: string | null
          action_mode_updated_by?: string | null
          agent_allowed_modules?: string[]
          agent_budget_monthly_cents?: number
          agent_permission_level?: Database["public"]["Enums"]["engine_agent_permission"]
          agent_safety_rules?: Json
          agent_spend_month_cents?: number
          agent_status?: string
          approved_at?: string | null
          approved_by_email?: string | null
          approved_snapshot?: Json
          approved_version?: string | null
          blueprint?: Json
          client_id: string
          client_portal_project_id?: string | null
          client_preview?: Json
          created_at?: string
          current_step?: string
          current_step_num?: number
          deadlines?: Json
          delivery?: Json
          delivery_mode?: Database["public"]["Enums"]["engine_delivery_mode"]
          extraction?: Json
          gap_map?: Json
          health_score?: number
          hidden_assets?: Json
          id?: string
          investment?: Json
          investment_confirmed_at?: string | null
          investment_confirmed_by?: string | null
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
          step_states?: Json
          updated_at?: string
        }
        Update: {
          action_mode_enabled?: boolean
          action_mode_updated_at?: string | null
          action_mode_updated_by?: string | null
          agent_allowed_modules?: string[]
          agent_budget_monthly_cents?: number
          agent_permission_level?: Database["public"]["Enums"]["engine_agent_permission"]
          agent_safety_rules?: Json
          agent_spend_month_cents?: number
          agent_status?: string
          approved_at?: string | null
          approved_by_email?: string | null
          approved_snapshot?: Json
          approved_version?: string | null
          blueprint?: Json
          client_id?: string
          client_portal_project_id?: string | null
          client_preview?: Json
          created_at?: string
          current_step?: string
          current_step_num?: number
          deadlines?: Json
          delivery?: Json
          delivery_mode?: Database["public"]["Enums"]["engine_delivery_mode"]
          extraction?: Json
          gap_map?: Json
          health_score?: number
          hidden_assets?: Json
          id?: string
          investment?: Json
          investment_confirmed_at?: string | null
          investment_confirmed_by?: string | null
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
          step_states?: Json
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
          {
            foreignKeyName: "engine_projects_client_portal_project_id_fkey"
            columns: ["client_portal_project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_projects_client_portal_project_id_fkey"
            columns: ["client_portal_project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_review_audit: {
        Row: {
          action: string
          actor: string | null
          at: string
          id: string
          item_type: string
          project: string
          reason: string | null
          review_item_id: string | null
          routed_to: string | null
          title: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          id?: string
          item_type: string
          project: string
          reason?: string | null
          review_item_id?: string | null
          routed_to?: string | null
          title: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          id?: string
          item_type?: string
          project?: string
          reason?: string | null
          review_item_id?: string | null
          routed_to?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_review_audit_review_item_id_fkey"
            columns: ["review_item_id"]
            isOneToOne: false
            referencedRelation: "engine_review_items"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_review_items: {
        Row: {
          client_portal_project_id: string | null
          created_at: string
          id: string
          impact: string
          item_type: string
          project: string
          project_id: string
          requested_by: string | null
          source: string | null
          status: string
          title: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          client_portal_project_id?: string | null
          created_at?: string
          id?: string
          impact?: string
          item_type: string
          project: string
          project_id: string
          requested_by?: string | null
          source?: string | null
          status?: string
          title: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          client_portal_project_id?: string | null
          created_at?: string
          id?: string
          impact?: string
          item_type?: string
          project?: string
          project_id?: string
          requested_by?: string | null
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_review_items_client_portal_project_id_fkey"
            columns: ["client_portal_project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_review_items_client_portal_project_id_fkey"
            columns: ["client_portal_project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_review_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_review_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_roadmap_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_preview_approved_at: string | null
          client_preview_approved_by: string | null
          client_preview_status: string
          created_at: string
          created_by: string
          generation_provenance: Json
          id: string
          label: string | null
          parent_version_id: string | null
          payload: Json
          project_id: string
          published_portal_roadmap_id: string | null
          published_to_portal_at: string | null
          source_ids: string[]
          status: Database["public"]["Enums"]["engine_version_status"]
          summary: string | null
          updated_at: string
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_preview_approved_at?: string | null
          client_preview_approved_by?: string | null
          client_preview_status?: string
          created_at?: string
          created_by?: string
          generation_provenance?: Json
          id?: string
          label?: string | null
          parent_version_id?: string | null
          payload?: Json
          project_id: string
          published_portal_roadmap_id?: string | null
          published_to_portal_at?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["engine_version_status"]
          summary?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_preview_approved_at?: string | null
          client_preview_approved_by?: string | null
          client_preview_status?: string
          created_at?: string
          created_by?: string
          generation_provenance?: Json
          id?: string
          label?: string | null
          parent_version_id?: string | null
          payload?: Json
          project_id?: string
          published_portal_roadmap_id?: string | null
          published_to_portal_at?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["engine_version_status"]
          summary?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_roadmap_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_roadmap_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_roadmap_versions_published_portal_roadmap_id_fkey"
            columns: ["published_portal_roadmap_id"]
            isOneToOne: false
            referencedRelation: "client_portal_roadmaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_roadmap_versions_published_portal_roadmap_id_fkey"
            columns: ["published_portal_roadmap_id"]
            isOneToOne: false
            referencedRelation: "portal_roadmaps_v"
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
          current_stage: string | null
          error: string | null
          finished_at: string | null
          id: string
          name: string
          processing_stages: Json
          project_id: string
          raw_text: string | null
          signals_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["engine_source_status"]
          storage_path: string | null
          type: Database["public"]["Enums"]["engine_source_type"]
          updated_at: string
          url: string | null
          used_in_version: string | null
          used_in_version_ids: string[]
          visibility: Database["public"]["Enums"]["engine_source_visibility"]
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by_email?: string | null
          current_stage?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          name: string
          processing_stages?: Json
          project_id: string
          raw_text?: string | null
          signals_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["engine_source_status"]
          storage_path?: string | null
          type: Database["public"]["Enums"]["engine_source_type"]
          updated_at?: string
          url?: string | null
          used_in_version?: string | null
          used_in_version_ids?: string[]
          visibility?: Database["public"]["Enums"]["engine_source_visibility"]
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by_email?: string | null
          current_stage?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          name?: string
          processing_stages?: Json
          project_id?: string
          raw_text?: string | null
          signals_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["engine_source_status"]
          storage_path?: string | null
          type?: Database["public"]["Enums"]["engine_source_type"]
          updated_at?: string
          url?: string | null
          used_in_version?: string | null
          used_in_version_ids?: string[]
          visibility?: Database["public"]["Enums"]["engine_source_visibility"]
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
      engine_tasks: {
        Row: {
          acceptance_criteria: Json
          agent_task_id: string | null
          ai_generated: boolean
          blocked_decision: string | null
          created_at: string
          created_by: string
          dependency_notes: string | null
          description: string | null
          due_date: string | null
          estimated_cost_cents: number | null
          estimated_effort_hours: number | null
          expected_artifact: string | null
          id: string
          milestone_id: string
          name: string
          owner_email: string | null
          phase: string | null
          priority: string
          project_id: string
          purpose: string | null
          qa_checklist: Json
          risks: Json
          roadmap_version_id: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acceptance_criteria?: Json
          agent_task_id?: string | null
          ai_generated?: boolean
          blocked_decision?: string | null
          created_at?: string
          created_by?: string
          dependency_notes?: string | null
          description?: string | null
          due_date?: string | null
          estimated_cost_cents?: number | null
          estimated_effort_hours?: number | null
          expected_artifact?: string | null
          id?: string
          milestone_id: string
          name: string
          owner_email?: string | null
          phase?: string | null
          priority?: string
          project_id: string
          purpose?: string | null
          qa_checklist?: Json
          risks?: Json
          roadmap_version_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: Json
          agent_task_id?: string | null
          ai_generated?: boolean
          blocked_decision?: string | null
          created_at?: string
          created_by?: string
          dependency_notes?: string | null
          description?: string | null
          due_date?: string | null
          estimated_cost_cents?: number | null
          estimated_effort_hours?: number | null
          expected_artifact?: string | null
          id?: string
          milestone_id?: string
          name?: string
          owner_email?: string | null
          phase?: string | null
          priority?: string
          project_id?: string
          purpose?: string | null
          qa_checklist?: Json
          risks?: Json
          roadmap_version_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_tasks_agent_task_id_fkey"
            columns: ["agent_task_id"]
            isOneToOne: false
            referencedRelation: "engine_agent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "engine_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_tasks_roadmap_version_id_fkey"
            columns: ["roadmap_version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_version_change_decisions: {
        Row: {
          actor_email: string | null
          change_id: string
          created_at: string
          decision: string
          id: string
          module_key: string
          note: string | null
          project_id: string
          version_id: string
        }
        Insert: {
          actor_email?: string | null
          change_id: string
          created_at?: string
          decision: string
          id?: string
          module_key: string
          note?: string | null
          project_id: string
          version_id: string
        }
        Update: {
          actor_email?: string | null
          change_id?: string
          created_at?: string
          decision?: string
          id?: string
          module_key?: string
          note?: string | null
          project_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_version_change_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_version_change_decisions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_drafts: {
        Row: {
          answers: Json
          attachments: Json
          contact: Json
          contact_email: string | null
          created_at: string
          current_objective: string | null
          current_question: string | null
          frame: string | null
          id: string
          objective_scores: Json
          open_objectives: Json
          resume_token: string
          sources: Json
          status: string
          subtype: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          attachments?: Json
          contact?: Json
          contact_email?: string | null
          created_at?: string
          current_objective?: string | null
          current_question?: string | null
          frame?: string | null
          id?: string
          objective_scores?: Json
          open_objectives?: Json
          resume_token?: string
          sources?: Json
          status?: string
          subtype?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          attachments?: Json
          contact?: Json
          contact_email?: string | null
          created_at?: string
          current_objective?: string | null
          current_question?: string | null
          frame?: string | null
          id?: string
          objective_scores?: Json
          open_objectives?: Json
          resume_token?: string
          sources?: Json
          status?: string
          subtype?: string | null
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
      operator_notification_reads: {
        Row: {
          email: string
          notification_id: string
          read_at: string
        }
        Insert: {
          email: string
          notification_id: string
          read_at?: string
        }
        Update: {
          email?: string
          notification_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "operator_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          kind: string
          metadata: Json
          submission_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind: string
          metadata?: Json
          submission_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind?: string
          metadata?: Json
          submission_id?: string | null
          title?: string
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
      roadmap_approvals: {
        Row: {
          approved_at: string
          approver_email: string | null
          created_at: string
          id: string
          notes: string | null
          project_id: string
          review_item_id: string | null
          snapshot_version: string
          version_id: string
        }
        Insert: {
          approved_at?: string
          approver_email?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          review_item_id?: string | null
          snapshot_version: string
          version_id: string
        }
        Update: {
          approved_at?: string
          approver_email?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          review_item_id?: string | null
          snapshot_version?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engine_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_approvals_review_item_id_fkey"
            columns: ["review_item_id"]
            isOneToOne: false
            referencedRelation: "engine_review_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "engine_roadmap_versions"
            referencedColumns: ["id"]
          },
        ]
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
      portal_activity_v: {
        Row: {
          actor_type: string | null
          created_at: string | null
          event_type: string | null
          id: string | null
          project_id: string | null
          summary: string | null
        }
        Insert: {
          actor_type?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          project_id?: string | null
          summary?: string | null
        }
        Update: {
          actor_type?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          project_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_portal_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_files_v: {
        Row: {
          bucket_id: string | null
          category: string | null
          created_at: string | null
          file_name: string | null
          file_type: string | null
          id: string | null
          linked_roadmap_document_id: string | null
          mime_type: string | null
          project_id: string | null
          size_bytes: number | null
          storage_path: string | null
          updated_at: string | null
          uploaded_by_role: string | null
        }
        Insert: {
          bucket_id?: string | null
          category?: string | null
          created_at?: string | null
          file_name?: string | null
          file_type?: string | null
          id?: string | null
          linked_roadmap_document_id?: string | null
          mime_type?: string | null
          project_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_by_role?: string | null
        }
        Update: {
          bucket_id?: string | null
          category?: string | null
          created_at?: string | null
          file_name?: string | null
          file_type?: string | null
          id?: string | null
          linked_roadmap_document_id?: string | null
          mime_type?: string | null
          project_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_by_role?: string | null
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
          {
            foreignKeyName: "client_portal_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_project_v: {
        Row: {
          access_granted_at: string | null
          access_revoked_at: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string | null
          current_phase: string | null
          id: string | null
          last_client_activity_at: string | null
          next_milestone: string | null
          next_milestone_due_at: string | null
          package_name: string | null
          payment_status: string | null
          portal_status: string | null
          primary_email: string | null
          purchase_date: string | null
          scheduling_url: string | null
          updated_at: string | null
        }
        Insert: {
          access_granted_at?: string | null
          access_revoked_at?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string | null
          current_phase?: string | null
          id?: string | null
          last_client_activity_at?: string | null
          next_milestone?: string | null
          next_milestone_due_at?: string | null
          package_name?: string | null
          payment_status?: string | null
          portal_status?: string | null
          primary_email?: string | null
          purchase_date?: string | null
          scheduling_url?: string | null
          updated_at?: string | null
        }
        Update: {
          access_granted_at?: string | null
          access_revoked_at?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string | null
          current_phase?: string | null
          id?: string | null
          last_client_activity_at?: string | null
          next_milestone?: string | null
          next_milestone_due_at?: string | null
          package_name?: string | null
          payment_status?: string | null
          portal_status?: string | null
          primary_email?: string | null
          purchase_date?: string | null
          scheduling_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      portal_roadmaps_v: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_email: string | null
          approved_at: string | null
          created_at: string | null
          current_diagnosis: string | null
          current_focus: string | null
          executive_summary: string | null
          id: string | null
          next_meeting_at: string | null
          next_milestone: string | null
          one_pager_file_id: string | null
          owner_name: string | null
          pdf_file_id: string | null
          project_id: string | null
          recommended_next_move: string | null
          risks_dependencies: Json | null
          sequence_30_60_90: Json | null
          share_url: string | null
          status: string | null
          strategic_priorities: Json | null
          title: string | null
          updated_at: string | null
          version_label: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_email?: string | null
          approved_at?: string | null
          created_at?: string | null
          current_diagnosis?: string | null
          current_focus?: string | null
          executive_summary?: string | null
          id?: string | null
          next_meeting_at?: string | null
          next_milestone?: string | null
          one_pager_file_id?: string | null
          owner_name?: string | null
          pdf_file_id?: string | null
          project_id?: string | null
          recommended_next_move?: string | null
          risks_dependencies?: Json | null
          sequence_30_60_90?: Json | null
          share_url?: string | null
          status?: string | null
          strategic_priorities?: Json | null
          title?: string | null
          updated_at?: string | null
          version_label?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_email?: string | null
          approved_at?: string | null
          created_at?: string | null
          current_diagnosis?: string | null
          current_focus?: string | null
          executive_summary?: string | null
          id?: string | null
          next_meeting_at?: string | null
          next_milestone?: string | null
          one_pager_file_id?: string | null
          owner_name?: string | null
          pdf_file_id?: string | null
          project_id?: string | null
          recommended_next_move?: string | null
          risks_dependencies?: Json | null
          sequence_30_60_90?: Json | null
          share_url?: string | null
          status?: string | null
          strategic_priorities?: Json | null
          title?: string | null
          updated_at?: string | null
          version_label?: string | null
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
            foreignKeyName: "client_portal_roadmaps_one_pager_file_id_fkey"
            columns: ["one_pager_file_id"]
            isOneToOne: false
            referencedRelation: "portal_files_v"
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
            foreignKeyName: "client_portal_roadmaps_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "portal_files_v"
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
            foreignKeyName: "client_portal_roadmaps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "portal_project_v"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_grant_role: {
        Args: { _email: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: string
      }
      admin_list_email_dlq: {
        Args: { _limit?: number; _queue: string }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
      admin_retry_email_dlq: {
        Args: { _dlq: string; _msg_id: number }
        Returns: number
      }
      admin_revoke_role: {
        Args: { _email: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
      client_portal_is_operator: { Args: { _email: string }; Returns: boolean }
      compute_engine_next_best_action: {
        Args: { _project_id: string }
        Returns: {
          action: string
          href: string
          reason: string
          severity: string
        }[]
      }
      count_recent_chat_events: {
        Args: { _project_id: string; _user_id: string; _window_seconds: number }
        Returns: {
          project_count: number
          user_count: number
        }[]
      }
      current_client_portal_project_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      engine_extraction_watchdog: { Args: never; Returns: number }
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
      is_engine_staff: { Args: never; Returns: boolean }
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
      log_portal_file_event: {
        Args: { _event: string; _file_id: string }
        Returns: string
      }
      mark_portal_follow_up_needed: {
        Args: { _project_id: string; _reason: string }
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
      recompute_engine_project_state: {
        Args: { _project_id: string }
        Returns: undefined
      }
      resolve_portal_follow_up: {
        Args: { _message_id: string }
        Returns: boolean
      }
      sync_client_access_user: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "operator" | "user" | "team_member"
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
      engine_delivery_mode: "internal_only" | "client_portal_required"
      engine_extraction_run_status:
        | "pending"
        | "running"
        | "succeeded"
        | "failed"
      engine_project_status:
        | "intake"
        | "active"
        | "source_processing"
        | "draft"
        | "needs_review"
        | "approved"
        | "delivered"
        | "in_execution"
        | "blocked"
        | "archived"
      engine_signal_category:
        | "goal"
        | "pain"
        | "opportunity"
        | "deadline"
        | "constraint"
        | "decision_maker"
        | "hidden_asset"
        | "risk"
        | "required_system"
        | "milestone_candidate"
        | "investment_signal"
        | "client_language"
        | "open_question"
        | "business_model"
        | "current_system"
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
      engine_source_visibility:
        | "internal_only"
        | "operator_only"
        | "client_safe"
      engine_version_status:
        | "ai_generated"
        | "draft"
        | "tai_edited"
        | "approved"
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
      app_role: ["admin", "operator", "user", "team_member"],
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
      engine_delivery_mode: ["internal_only", "client_portal_required"],
      engine_extraction_run_status: [
        "pending",
        "running",
        "succeeded",
        "failed",
      ],
      engine_project_status: [
        "intake",
        "active",
        "source_processing",
        "draft",
        "needs_review",
        "approved",
        "delivered",
        "in_execution",
        "blocked",
        "archived",
      ],
      engine_signal_category: [
        "goal",
        "pain",
        "opportunity",
        "deadline",
        "constraint",
        "decision_maker",
        "hidden_asset",
        "risk",
        "required_system",
        "milestone_candidate",
        "investment_signal",
        "client_language",
        "open_question",
        "business_model",
        "current_system",
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
      engine_source_visibility: [
        "internal_only",
        "operator_only",
        "client_safe",
      ],
      engine_version_status: [
        "ai_generated",
        "draft",
        "tai_edited",
        "approved",
        "delivered",
        "archived",
      ],
    },
  },
} as const
