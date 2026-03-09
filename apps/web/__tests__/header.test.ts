import { describe, expect, it } from "vitest";
import { MOMENTUM_PULSE_MS, resolveMomentumPulse } from "../src/components/Header";

describe("Header momentum pulse", () => {
  it("does not pulse during initial score hydration", () => {
    expect(resolveMomentumPulse(0, 12, false)).toBeNull();
  });

  it("pulses up only after initialization when score increases", () => {
    expect(resolveMomentumPulse(12, 13, true)).toBe("up");
  });

  it("pulses up when completion signal increases even if displayed score is unchanged", () => {
    expect(resolveMomentumPulse(8, 9, true)).toBe("up");
  });

  it("keeps the highlight temporary instead of persistent", () => {
    expect(MOMENTUM_PULSE_MS).toBe(5000);
  });
});
