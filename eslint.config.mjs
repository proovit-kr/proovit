import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 이식 원본. 빌드에도 들어가지 않으므로 린트 대상이 아니다 (legacy/README.md 참조)
    "legacy/**",
    // Prisma 생성물
    "src/generated/**",
  ]),
]);

export default eslintConfig;
