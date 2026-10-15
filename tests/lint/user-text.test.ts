import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The lint rules that keep user-visible text in messages/ (eslint.config.mjs), run on in-memory sources.
const eslint = new ESLint();

async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}

describe("user-visible text lint", () => {
  it.each([
    ['<button aria-label="Close" />', "aria-label"],
    ['<img alt="Ring" src="/a.png" />', "alt"],
    ["<input placeholder={`Search`} />", "placeholder"],
    ["<span title={'Hint'} />", "title"],
  ])("fails a literal attribute: %s", async (jsx) => {
    const ids = await ruleIds(`export const A = () => ${jsx};\n`, "src/components/a.tsx");
    expect(ids).toContain("no-restricted-syntax");
  });

  it.each([
    ['export const item = { href: "/shop", label: "Shop" };', "a label"],
    ['export const metadata = { title: "Über uns" };', "a title"],
    ['export const schema = { message: "Поле обовʼязкове" };', "a message"],
    ['declare const toast: { error(m: string): void };\ntoast.error("Deletion error");', "a toast"],
  ])("fails user text in a .ts module: %s", async (code) => {
    expect(await ruleIds(`${code}\n`, "src/lib/a.ts")).toContain("no-restricted-syntax");
  });

  it("passes translated attributes, message keys and non-text strings", async () => {
    const tsx = [
      'import { useTranslations } from "next-intl";',
      "export function A() {",
      '  const t = useTranslations("nav");',
      '  return <button aria-label={t("openMenu")} title={t("openMenu")} className="h-11" type="button" />;',
      "}",
      "",
    ].join("\n");
    expect(await ruleIds(tsx, "src/components/a.tsx")).toEqual([]);
    expect(await ruleIds('export const item = { href: "/shop", labelKey: "shop", title: "" };\n', "src/lib/a.ts")).toEqual(
      [],
    );
  });

  it("leaves the dev-only ui-kit page alone", async () => {
    const tsx = 'export default function Page() {\n  return <button aria-label="Close" type="button" />;\n}\n';
    expect(await ruleIds(tsx, "src/app/[locale]/ui-kit/page.tsx")).toEqual([]);
  });
});
