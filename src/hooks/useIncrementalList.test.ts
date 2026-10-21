import { describe, it, expect } from "vitest";
import { clampWindow } from "./useIncrementalList";

/**
 * Regression suite for "adding songs restarts the queue".
 *
 * The old policy reset the render window to `min(initial, len)` on every new
 * array identity, so appending to a scrolled queue deleted every row past 250,
 * clamped scrollTop and made the list visually restart. Appends must NEVER
 * shrink the window.
 */
describe("useIncrementalList · window policy (clampWindow)", () => {
  it("append keeps a deep window (queue add must not restart)", () => {
    // user scrolled deep: 600 rows rendered in a 1000-track queue → one add
    expect(clampWindow(600, 250, 1001)).toBe(600);
    // old policy would have returned min(250, 1001) = 250 → collapse
  });

  it("append grows a short window so the new row renders immediately", () => {
    expect(clampWindow(10, 250, 11)).toBe(11);
    expect(clampWindow(0, 250, 5)).toBe(5);
  });

  it("removal clamps to the new length without collapsing to the initial window", () => {
    expect(clampWindow(600, 250, 599)).toBe(599);
    expect(clampWindow(600, 250, 100)).toBe(100);
  });

  it("fresh/short lists floor at min(initial, length)", () => {
    expect(clampWindow(0, 250, 3000)).toBe(250); // mount default grows to initial
    expect(clampWindow(5, 250, 3000)).toBe(250); // tiny previous list → new big list
    expect(clampWindow(5, 250, 10)).toBe(10); // shorter than initial → full list
  });

  it("empty list yields 0 and recovers on the first add", () => {
    expect(clampWindow(250, 250, 0)).toBe(0);
    expect(clampWindow(0, 250, 1)).toBe(1);
  });

  it("window never exceeds the list length", () => {
    expect(clampWindow(9999, 250, 42)).toBe(42);
  });
});
