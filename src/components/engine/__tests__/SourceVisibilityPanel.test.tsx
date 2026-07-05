/**
 * Integration test — Admin-only source visibility workflow.
 *
 * Proves:
 *  1. Non-admin (operator) sees a locked notice and cannot submit any
 *     visibility change — changeSourceVisibility is never called.
 *  2. Admin can pick a new visibility, type a reason, and submit; the
 *     UI calls changeSourceVisibility with the exact new_value and
 *     reason string entered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EngineRoleState } from "@/hooks/useEngineRole";

// --- Module mocks -----------------------------------------------------------

let currentRole: EngineRoleState;

vi.mock("@/hooks/useEngineRole", () => ({
  useEngineRole: () => currentRole,
}));

// useServerFn(fn) → fn. Lets us assert on the mocked server-fn spies below.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <F,>(fn: F) => fn,
}));

const changeSourceVisibility = vi.fn();
const listProjectSourcesForAdmin = vi.fn();

vi.mock("@/lib/engine-sources.functions", () => ({
  changeSourceVisibility: (...args: unknown[]) => changeSourceVisibility(...args),
  listProjectSourcesForAdmin: (...args: unknown[]) => listProjectSourcesForAdmin(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks so the component picks them up.
import { SourceVisibilityPanel } from "@/components/engine/SourceVisibilityPanel";

// --- Helpers ----------------------------------------------------------------

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SOURCE_ID = "22222222-2222-2222-2222-222222222222";

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SourceVisibilityPanel projectId={PROJECT_ID} />
    </QueryClientProvider>,
  );
}

function roleState(overrides: Partial<EngineRoleState>): EngineRoleState {
  return {
    role: "guest",
    email: null,
    loading: false,
    isAdmin: false,
    isOperator: false,
    canApprove: false,
    canEdit: false,
    canRegenerate: false,
    canSendTasks: false,
    canPublish: false,
    canSendDelivery: false,
    canEditInvestment: false,
    canEditClientPreview: false,
    canManageAgents: false,
    approvalDeniedReason: "",
    editDeniedReason: "",
    adminOnlyReason: "Admin only — operators cannot perform this action.",
    ...overrides,
  };
}

beforeEach(() => {
  changeSourceVisibility.mockReset();
  listProjectSourcesForAdmin.mockReset();
});

afterEach(cleanup);

// --- Tests ------------------------------------------------------------------

describe("SourceVisibilityPanel — admin-only submission", () => {
  it("blocks non-admins: operator sees a lock notice and cannot call changeSourceVisibility", async () => {
    currentRole = roleState({ role: "operator", isOperator: true, isAdmin: false });

    renderPanel();

    // Locked copy is shown.
    expect(
      screen.getByText(/admin only — visibility changes require an admin/i),
    ).toBeInTheDocument();

    // No source list is fetched and no Change control is rendered.
    expect(listProjectSourcesForAdmin).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /change/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit change/i })).toBeNull();
    expect(changeSourceVisibility).not.toHaveBeenCalled();
  });

  it("admin submission calls changeSourceVisibility with the chosen new_value and reason", async () => {
    currentRole = roleState({ role: "admin", isAdmin: true });

    listProjectSourcesForAdmin.mockResolvedValue({
      rows: [
        {
          id: SOURCE_ID,
          name: "Discovery call transcript",
          visibility: "internal_only",
          status: "processed",
          type: "transcript",
          updated_at: new Date().toISOString(),
        },
      ],
    });
    changeSourceVisibility.mockResolvedValue({
      ok: true,
      unchanged: false,
      sourceId: SOURCE_ID,
      oldVisibility: "internal_only",
      newVisibility: "client_safe",
    });

    renderPanel();

    // Row loads.
    await screen.findByText("Discovery call transcript");
    expect(listProjectSourcesForAdmin).toHaveBeenCalledWith({
      data: { projectId: PROJECT_ID },
    });

    // Open the change form.
    fireEvent.click(screen.getByRole("button", { name: /^change$/i }));

    // Pick "Client safe".
    fireEvent.click(screen.getByRole("button", { name: /client safe/i }));

    // Provide the required reason.
    const REASON = "Approved for case study — client cleared quotes.";
    const textarea = screen.getByPlaceholderText(/reason \(required/i);
    fireEvent.change(textarea, { target: { value: REASON } });

    // Submit.
    fireEvent.click(screen.getByRole("button", { name: /submit change/i }));

    await waitFor(() => expect(changeSourceVisibility).toHaveBeenCalledTimes(1));
    expect(changeSourceVisibility).toHaveBeenCalledWith({
      data: {
        sourceId: SOURCE_ID,
        visibility: "client_safe",
        reason: REASON,
      },
    });
  });

  it("admin cannot submit until reason ≥ 3 chars AND visibility differs from current", async () => {
    currentRole = roleState({ role: "admin", isAdmin: true });

    listProjectSourcesForAdmin.mockResolvedValue({
      rows: [
        {
          id: SOURCE_ID,
          name: "Website scrape",
          visibility: "internal_only",
          status: "processed",
          type: "url",
          updated_at: new Date().toISOString(),
        },
      ],
    });

    renderPanel();

    await screen.findByText("Website scrape");
    fireEvent.click(screen.getByRole("button", { name: /^change$/i }));

    const submit = screen.getByRole("button", { name: /submit change/i });

    // Same visibility as current → disabled even with a reason.
    fireEvent.change(screen.getByPlaceholderText(/reason \(required/i), {
      target: { value: "long enough reason" },
    });
    expect(submit).toBeDisabled();

    // Different visibility but no reason → still disabled.
    fireEvent.click(screen.getByRole("button", { name: /operator only/i }));
    fireEvent.change(screen.getByPlaceholderText(/reason \(required/i), {
      target: { value: "" },
    });
    expect(submit).toBeDisabled();

    // Different visibility + short reason (< 3 chars) → disabled.
    fireEvent.change(screen.getByPlaceholderText(/reason \(required/i), {
      target: { value: "ok" },
    });
    expect(submit).toBeDisabled();

    // No submissions leaked through during the disabled-state assertions.
    expect(changeSourceVisibility).not.toHaveBeenCalled();
  });
});
