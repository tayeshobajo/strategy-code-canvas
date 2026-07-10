import { z } from "zod";

/**
 * Shared password schema for account setup, reset, and change flows.
 * Any surface that lets a user set/change their password MUST use this
 * schema so the contract stays consistent across /reset-password and
 * /portal/account (and any future surface).
 */
export const PasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(10, "At least 10 characters")
      .max(128, "Too long")
      .regex(/[A-Za-z]/, "Include a letter")
      .regex(/[0-9]/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

export type PasswordFieldErrors = {
  newPassword?: string;
  confirm?: string;
};

export function validatePassword(input: {
  newPassword: string;
  confirm: string;
}): { ok: true } | { ok: false; errors: PasswordFieldErrors } {
  const parsed = PasswordSchema.safeParse(input);
  if (parsed.success) return { ok: true };
  const errors: PasswordFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof PasswordFieldErrors;
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

export function scorePasswordStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export const PASSWORD_STRENGTH_LABELS = [
  "Weak",
  "Weak",
  "Fair",
  "Strong",
  "Very strong",
] as const;
