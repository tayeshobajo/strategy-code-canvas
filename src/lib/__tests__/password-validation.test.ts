import { describe, expect, it } from "vitest";
import {
  PASSWORD_STRENGTH_LABELS,
  PasswordSchema,
  scorePasswordStrength,
  validatePassword,
} from "../password-validation";

describe("password-validation", () => {
  describe("validatePassword", () => {
    it("accepts a compliant password", () => {
      const r = validatePassword({
        newPassword: "Secret1234",
        confirm: "Secret1234",
      });
      expect(r.ok).toBe(true);
    });

    it("rejects passwords shorter than 10 chars", () => {
      const r = validatePassword({ newPassword: "abc1", confirm: "abc1" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.newPassword).toMatch(/10 characters/i);
    });

    it("requires a letter", () => {
      const r = validatePassword({
        newPassword: "1234567890",
        confirm: "1234567890",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.newPassword).toMatch(/letter/i);
    });

    it("requires a number", () => {
      const r = validatePassword({
        newPassword: "abcdefghij",
        confirm: "abcdefghij",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.newPassword).toMatch(/number/i);
    });

    it("flags mismatched confirm on the confirm field", () => {
      const r = validatePassword({
        newPassword: "Secret1234",
        confirm: "Secret1235",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.confirm).toMatch(/don't match/i);
        expect(r.errors.newPassword).toBeUndefined();
      }
    });

    it("rejects passwords over 128 chars", () => {
      const long = "a1".repeat(80);
      const r = validatePassword({ newPassword: long, confirm: long });
      expect(r.ok).toBe(false);
    });
  });

  describe("scorePasswordStrength", () => {
    it("returns 0 for empty", () => {
      expect(scorePasswordStrength("")).toBe(0);
    });
    it("caps at 4", () => {
      expect(scorePasswordStrength("Abcdefghij1234!@")).toBe(4);
    });
    it("scales with complexity", () => {
      expect(scorePasswordStrength("abcdefghij")).toBeGreaterThanOrEqual(1);
      expect(scorePasswordStrength("Abcdefghij1")).toBeGreaterThan(
        scorePasswordStrength("abcdefghij"),
      );
    });
  });

  it("exposes a label for every score", () => {
    for (let s = 0; s <= 4; s++) {
      expect(PASSWORD_STRENGTH_LABELS[s]).toBeTruthy();
    }
  });

  it("PasswordSchema is exported for direct zod use", () => {
    expect(PasswordSchema.safeParse({ newPassword: "Secret1234", confirm: "Secret1234" }).success).toBe(true);
  });
});
