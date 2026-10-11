import { describe, expect, it } from "vitest";
import { panePrefString, readPanePref } from "./pane-pref";

describe("pane pref", () => {
  it("junk or nothing gives the default open panel", () => {
    expect(readPanePref(null, 244, 196, 380)).toEqual({ width: 244, collapsed: false });
    expect(readPanePref("wide", 244, 196, 380)).toEqual({ width: 244, collapsed: false });
    expect(readPanePref("12345", 244, 196, 380)).toEqual({ width: 244, collapsed: false });
  });
  it("reads width and the folded flag, and pulls a stray width back in", () => {
    expect(readPanePref("300c", 244, 196, 380)).toEqual({ width: 300, collapsed: true });
    expect(readPanePref("90", 244, 196, 380).width).toBe(196);
    expect(readPanePref("2000", 244, 196, 380).width).toBe(380);
  });
  it("round trips", () => {
    expect(panePrefString({ width: 287.6, collapsed: false })).toBe("288");
    expect(readPanePref(panePrefString({ width: 300, collapsed: true }), 244, 196, 380)).toEqual({ width: 300, collapsed: true });
  });
});
