import { describe, expect, it } from "vitest";
import { nameScanRoot } from "./explorerScope";

describe("nameScanRoot", () => {
  it("names the scan root after its folder", () => {
    expect(nameScanRoot({ name: "root", path: "/Users/me/Projects/srcly" }).name).toBe("srcly");
    expect(nameScanRoot({ name: "root", path: "C:\\code\\app\\" }).name).toBe("app");
  });

  it("leaves other names, a bare filesystem root, and no tree alone", () => {
    expect(nameScanRoot({ name: "client", path: "/r/client" }).name).toBe("client");
    expect(nameScanRoot({ name: "root", path: "/" }).name).toBe("root");
    expect(nameScanRoot(null)).toBeNull();
  });
});
