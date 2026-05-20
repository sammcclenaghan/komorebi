import { describe, expect, it } from "vitest";
import { cn } from "~/lib/cn";

describe("cn", () => {
  it("merges conditional classes", () => {
    expect(cn("p-2", false && "hidden", "text-sm")).toBe("p-2 text-sm");
  });

  it("lets later tailwind classes win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
