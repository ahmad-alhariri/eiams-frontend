import { describe, expect, it } from "vitest";
import { issueInfoSchema, ISSUE_REASON_MAX_LENGTH } from "./issue-info.schema";

describe("issue-info schema parity", () => {
  it("matches backend 200-char cap exactly", () => {
    expect(ISSUE_REASON_MAX_LENGTH).toBe(200);
  });

  it("passes at 200 chars", () => {
    const result = issueInfoSchema.parse({
      recipientType: "Employee",
      recipientId: "550e8400-e29b-41d4-a716-446655440000",
      issueReason: "a".repeat(200),
    });
    expect(result.issueReason.length).toBe(200);
  });

  it("fails at 201 chars", () => {
    expect(() => issueInfoSchema.parse({
      recipientType: "Employee",
      recipientId: "550e8400-e29b-41d4-a716-446655440000",
      issueReason: "a".repeat(201),
    })).toThrow();
  });
});
