import { describe, expect, it } from "vitest";
import { canReceiveMessage } from "./privacy";
describe("recipient messaging preferences", () => {
  it.each([
    [false, false, false, false],
    [false, true, false, true],
    [true, false, false, true],
    [true, true, true, false],
    [true, false, true, false],
    [false, true, true, false],
  ])(
    "connection=%s, opt-in=%s, block=%s => %s",
    (connected, allowNonConnections, blocked, expected) => {
      expect(
        canReceiveMessage({ connected, allowNonConnections, blocked }),
      ).toBe(expected);
    },
  );
});
