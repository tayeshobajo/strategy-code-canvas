import { ShieldAlert } from "lucide-react";

/**
 * Small inline banner that appears above admin-only actions to explain to
 * operators why a control is disabled or hidden.
 */
export function OperatorLockNotice({
  message = "Operator view — this action requires an admin.",
  className = "",
}: { message?: string; className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[11px] rounded-md border border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713] px-2 py-1 ${className}`}
      role="note"
    >
      <ShieldAlert className="w-3 h-3" />
      {message}
    </div>
  );
}
