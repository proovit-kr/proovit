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
    // Cloudflare Workers 빌드 산출물 (spike/cloudflare-workers 브랜치에서 생긴다).
    // .gitignore에도 있지만 eslint는 gitignore를 보지 않아 따로 적어야 한다 —
    // 안 적으면 남의 번들이 린트 에러 480건을 만들어 우리 코드 문제를 덮는다.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
