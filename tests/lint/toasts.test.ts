import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The lint rule that keeps sonner out of the first load (#105, eslint.config.mjs), run on in-memory sources.
const eslint = new ESLint();

async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}

describe("toast imports lint", () => {
  it.each([
    ['import { toast } from "sonner";\nexport const a = toast;\n', "sonner"],
    ['import { Toaster } from "@/components/ui/sonner";\nexport const a = Toaster;\n', "the toaster"],
    ['import { Toaster } from "../ui/sonner";\nexport const a = Toaster;\n', "the toaster, relative"],
  ])("fails a direct import: %s", async (code) => {
    expect(await ruleIds(code, "src/components/admin/a.tsx")).toContain("no-restricted-imports");
  });

  it("fails a dynamic import of sonner outside the proxy", async () => {
    const code = 'export const load = () => import("sonner");\n';
    expect(await ruleIds(code, "src/components/admin/a.ts")).toContain("no-restricted-syntax");
  });

  it("passes the toast proxy", async () => {
    const code = 'import { toast } from "@/components/layout/toast";\nexport const a = toast;\n';
    expect(await ruleIds(code, "src/components/admin/a.tsx")).not.toContain("no-restricted-imports");
  });
});
