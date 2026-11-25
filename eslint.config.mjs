import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals, ...nextTypescript,
  globalIgnores(["node_modules/**", ".next/**", ".cache/**", "dist/**", "build/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "**/*.min.js"]),
  { files: ["src/domain/**/*.ts"], rules: { "no-restricted-imports": ["error", { patterns: ["@/server/**", "@/client/**", "next/**", "server-only", "pg", "dexie"] }] } },
  { files: ["src/client/**/*.{ts,tsx}"], rules: { "no-restricted-imports": ["error", { patterns: ["@/server/**", "pg", "better-auth"] }] } },
]);
