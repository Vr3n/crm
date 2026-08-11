import { describe, it, expect } from "vitest";
import { formatINR } from "../../src/renderer/src/lib/money";

describe("formatINR", () => {
  it("formats cents with Indian grouping", () => {
    expect(formatINR(123450)).toBe("₹1,234.50");
  });
  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0.00");
  });
  it("handles lakhs", () => {
    expect(formatINR(10_00_00000)).toBe("₹10,00,000.00");
  });
});
