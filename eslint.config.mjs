import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// a string is user-visible text when it holds a letter (Latin, Latin-1/Extended, Cyrillic)
const letter = "/[A-Za-z\\u00C0-\\u024F\\u0400-\\u04FF]/";
// JSX attributes a user reads or hears
const textAttribute = "/^(alt|title|placeholder|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$/";
// object keys that carry user text in .ts modules and metadata/config objects (nav items, zod, toasts, metadata)
const textKey = "/^(alt|title|placeholder|label|description|message|text|caption|tooltip|ariaLabel|aria-label)$/";
const literalText = (parent, message) => [
  { selector: `${parent} > Literal[value=${letter}]`, message },
  { selector: `${parent} > TemplateLiteral[expressions.length=0]`, message },
];
const textInAttribute = "user-visible attribute text comes from messages/ through next-intl (t(...)), never a literal";
const textInModule = "user-visible text comes from messages/ through next-intl; keep a message key here, not the text";

// the ui-kit page is a dev-only showcase (404 in production) and keeps English labels
const textRuleIgnores = ["src/**/*.test.ts", "src/**/*.test.tsx", "src/app/[[]locale]/ui-kit/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // all user-visible text comes from messages/ through next-intl; JSX text and string children fail
    files: ["src/**/*.tsx"],
    ignores: textRuleIgnores,
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // ...and so do the attributes a user reads or hears, and text kept in .ts modules or objects
    files: ["src/**/*.{ts,tsx}"],
    ignores: textRuleIgnores,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...literalText(`JSXAttribute[name.name=${textAttribute}]`, textInAttribute),
        ...literalText(`JSXAttribute[name.name=${textAttribute}] > JSXExpressionContainer`, textInAttribute),
        ...literalText(`Property[key.name=${textKey}]`, textInModule),
        ...literalText(`Property[key.value=${textKey}]`, textInModule),
        ...literalText("CallExpression[callee.name='toast']", textInModule),
        ...literalText("CallExpression[callee.object.name='toast']", textInModule),
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "supabase/.temp/**",
    "supabase/.branches/**",
  ]),
]);

export default eslintConfig;
