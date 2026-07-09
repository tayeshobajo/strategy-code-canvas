// Project Chat — Action Mode v3
// Client-safe action registry consumed by both the ProposalCard UI (button
// visibility, confirmation copy, tooltips) AND the server dispatcher
// (validation). Never mutates protected truth (roadmaps, portal, tasks
// completion, investment terms) — every registered action creates an
// internal artifact, a pending review item, or a `suggested` task only.

import type { ProposalType, ProposalStatus } from "@/lib/engine-chat-proposals.functions";

export type ChatActionCapability =
  | "canSubmitReview"
  | "canCreateTasks"
  | "canCreateArtifacts"
  | "staff";

export type ChatActionId =
  | "save_proposal"
  | "dismiss_proposal"
  | "submit_proposal_to_review"
  | "convert_to_suggested_task"
  | "save_clarification_draft"
  | "save_implementation_prompt_artifact"
  | "save_qa_checklist_artifact"
  | "save_milestone_brief_artifact"
  | "add_internal_decision_note";

export type ChatActionDefinition = {
  action_id: ChatActionId;
  label: string;
  description: string;
  allowed_proposal_types: ReadonlyArray<ProposalType>;
  // Allowed proposal statuses at the point the action is triggered. Empty
  // means status is irrelevant (e.g. Save creates the row).
  allowed_statuses: ReadonlyArray<ProposalStatus>;
  required_capability: ChatActionCapability;
  requires_action_mode: boolean;
  requires_approval: boolean;
  mutates_protected_truth: false;
  confirmation_copy: string;
  success_message: string;
  failure_message: string;
  audit_event: string;
  activity_kind: string;
};

const ALL_TYPES: ReadonlyArray<ProposalType> = [
  "client_clarification",
  "review_item",
  "suggested_task",
  "implementation_prompt",
  "qa_checklist",
  "milestone_brief",
];

export const CHAT_ACTIONS: ReadonlyArray<ChatActionDefinition> = [
  {
    action_id: "save_proposal",
    label: "Save",
    description: "Save this proposal to the project for later.",
    allowed_proposal_types: ALL_TYPES,
    allowed_statuses: ["draft"],
    required_capability: "staff",
    requires_action_mode: false,
    requires_approval: false,
    mutates_protected_truth: false,
    confirmation_copy: "Save this proposal to the project. It is not sent to the client and does not approve anything.",
    success_message: "Proposal saved.",
    failure_message: "Failed to save proposal.",
    audit_event: "proposal_saved",
    activity_kind: "chat_proposal_saved",
  },
  {
    action_id: "dismiss_proposal",
    label: "Dismiss",
    description: "Dismiss this proposal.",
    allowed_proposal_types: ALL_TYPES,
    allowed_statuses: ["draft", "saved"],
    required_capability: "staff",
    requires_action_mode: false,
    requires_approval: false,
    mutates_protected_truth: false,
    confirmation_copy: "Dismiss this proposal. It stays in the audit log but is hidden from the chat.",
    success_message: "Proposal dismissed.",
    failure_message: "Failed to dismiss proposal.",
    audit_event: "proposal_dismissed",
    activity_kind: "chat_proposal_dismissed",
  },
  {
    action_id: "submit_proposal_to_review",
    label: "Submit to Review",
    description: "Send this proposal to the internal review queue as a pending item.",
    allowed_proposal_types: ["review_item", "implementation_prompt", "qa_checklist", "milestone_brief"],
    allowed_statuses: ["draft", "saved"],
    required_capability: "canSubmitReview",
    requires_action_mode: true,
    requires_approval: true,
    mutates_protected_truth: false,
    confirmation_copy:
      "Create a pending review item for the operator queue. This does not approve, publish, or send anything to the client — a human must still review it.",
    success_message: "Review item created (pending).",
    failure_message: "Failed to submit to review.",
    audit_event: "proposal_submitted_for_review",
    activity_kind: "chat_proposal_submitted",
  },
  {
    action_id: "convert_to_suggested_task",
    label: "Save as Suggested Task",
    description: "Create an engine task with status 'suggested'.",
    allowed_proposal_types: ["suggested_task"],
    allowed_statuses: ["draft", "saved"],
    required_capability: "canCreateTasks",
    requires_action_mode: true,
    requires_approval: true,
    mutates_protected_truth: false,
    confirmation_copy:
      "Create an engine task with status 'suggested'. It is not approved, not in progress, not visible to the client, and not marked complete.",
    success_message: "Suggested task created.",
    failure_message: "Failed to create suggested task.",
    audit_event: "proposal_converted_to_task",
    activity_kind: "chat_proposal_converted",
  },
  {
    action_id: "save_clarification_draft",
    label: "Save Clarification Draft",
    description: "Save an internal-only clarification artifact. Does not send anything to the client.",
    allowed_proposal_types: ["client_clarification"],
    allowed_statuses: ["draft", "saved"],
    required_capability: "canCreateArtifacts",
    requires_action_mode: true,
    requires_approval: true,
    mutates_protected_truth: false,
    confirmation_copy:
      "Save this clarification question as an INTERNAL draft artifact. Nothing is sent to the client until an operator does so manually.",
    success_message: "Clarification draft saved.",
    failure_message: "Failed to save clarification draft.",
    audit_event: "artifact_created",
    activity_kind: "chat_artifact_created",
  },
  {
    action_id: "save_implementation_prompt_artifact",
    label: "Save Implementation Prompt",
    description: "Save the implementation prompt as an internal artifact.",
    allowed_proposal_types: ["implementation_prompt"],
    allowed_statuses: ["draft", "saved"],
    required_capability: "canCreateArtifacts",
    requires_action_mode: true,
    requires_approval: true,
    mutates_protected_truth: false,
    confirmation_copy:
      "Save the implementation prompt as an internal artifact linked to this project and proposal. It is NOT auto-sent to Lovable or any client surface.",
    success_message: "Implementation prompt saved.",
    failure_message: "Failed to save implementation prompt.",
    audit_event: "artifact_created",
    activity_kind: "chat_artifact_created",
  },
  {
    action_id: "save_qa_checklist_artifact",
    label: "Save QA Checklist",
    description: "Save the QA checklist as an internal artifact.",
    allowed_proposal_types: ["qa_checklist"],
    allowed_statuses: ["draft", "saved"],
    required_capability: "canCreateArtifacts",
    requires_action_mode: true,
    requires_approval: true,
    mutates_protected_truth: false,
    confirmation_copy:
      "Save the QA checklist as an internal artifact linked to this project and proposal. It is not published or run automatically.",
    success_message: "QA checklist saved.",
    failure_message: "Failed to save QA checklist.",
    audit_event: "artifact_created",
    activity_kind: "chat_artifact_created",
  },
  {
    action_id: "save_milestone_brief_artifact",
    label: "Save Milestone Brief",
    description: "Save the milestone brief as an internal artifact.",
    allowed_proposal_types: ["milestone_brief"],
    allowed_statuses: ["draft", "saved"],
    required_capability: "canCreateArtifacts",
    requires_action_mode: true,
    requires_approval: true,
    mutates_protected_truth: false,
    confirmation_copy:
      "Save the milestone brief as an internal artifact. This does not change the project milestone plan or client roadmap.",
    success_message: "Milestone brief saved.",
    failure_message: "Failed to save milestone brief.",
    audit_event: "artifact_created",
    activity_kind: "chat_artifact_created",
  },
  {
    action_id: "add_internal_decision_note",
    label: "Add Decision Note",
    description: "Save an internal decision note in the project activity log.",
    allowed_proposal_types: ALL_TYPES,
    allowed_statuses: ["draft", "saved"],
    required_capability: "canCreateArtifacts",
    requires_action_mode: true,
    requires_approval: true,
    mutates_protected_truth: false,
    confirmation_copy:
      "Log an internal decision note tied to this proposal. Internal only — not visible to the client and does not change project state.",
    success_message: "Decision note recorded.",
    failure_message: "Failed to record decision note.",
    audit_event: "decision_note_created",
    activity_kind: "chat_decision_note",
  },
];

export function getChatAction(id: ChatActionId): ChatActionDefinition | undefined {
  return CHAT_ACTIONS.find((a) => a.action_id === id);
}

export function getActionsForProposal(proposalType: ProposalType): ChatActionDefinition[] {
  return CHAT_ACTIONS.filter((a) => a.allowed_proposal_types.includes(proposalType));
}

// UI helper — decide if a specific action button should be shown/enabled given
// current caps + proposal state.
export function isActionAvailable(args: {
  action: ChatActionDefinition;
  proposalType: ProposalType;
  proposalStatus: ProposalStatus;
  caps: {
    isStaff: boolean;
    canCreateTasks: boolean;
    canSubmitReview: boolean;
    canCreateArtifacts: boolean;
    actionModeEnabled: boolean;
  };
}): { visible: boolean; enabled: boolean; disabledReason?: string } {
  const { action, proposalType, proposalStatus, caps } = args;
  if (!action.allowed_proposal_types.includes(proposalType)) return { visible: false, enabled: false };

  // Capability gate — hide entirely if the user lacks the capability.
  const capMap: Record<ChatActionCapability, boolean> = {
    staff: caps.isStaff,
    canCreateTasks: caps.canCreateTasks,
    canSubmitReview: caps.canSubmitReview,
    canCreateArtifacts: caps.canCreateArtifacts,
  };
  if (!capMap[action.required_capability]) return { visible: false, enabled: false };

  // Status gate — hide when transition invalid.
  if (action.allowed_statuses.length && !action.allowed_statuses.includes(proposalStatus)) {
    return { visible: false, enabled: false };
  }

  // Action Mode gate — visible but disabled with tooltip when required and off.
  if (action.requires_action_mode && !caps.actionModeEnabled) {
    return {
      visible: true,
      enabled: false,
      disabledReason: "Action Mode is off for this project. An admin can enable it in the chat sidebar.",
    };
  }

  return { visible: true, enabled: true };
}
