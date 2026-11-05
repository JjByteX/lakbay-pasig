// Same rule set as Lakbay Pasig (eslint recommended, typescript-eslint
// recommended, react-hooks), with Next's rules instead of the Vite plugin.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next", "node_modules", "supabase", "scripts", "next-env.d.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // These two rules (Pages Router only) call ESLint APIs removed in
      // ESLint 9 and crash the run. Not relevant to an App Router project.
      "@next/next/no-duplicate-head": "off",
      "@next/next/no-page-custom-font": "off",
    },
  }
);
