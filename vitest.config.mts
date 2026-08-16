import { defineConfig } from "vitest/config";

// 판정 로직은 순수 함수라 DB·환경변수·jsdom이 전부 필요 없다.
// `@/*` 별칭은 tsconfig의 paths를 Vite가 직접 읽는다(별도 플러그인 불필요).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
