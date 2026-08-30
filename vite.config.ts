import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    "*.py": ["uv run ruff format", "uv run ruff check --fix"],
  },
  fmt: {
    ignorePatterns: [
      "**/src/generated/**",
      "**/openapi.json",
      ".beaver/**",
      ".agents/**",
      ".claude/**",
      ".pi/**",
      "apps/worker/src/goldens/pixelmatch.js",
      "apps/web/vendor/**",
    ],
  },
  lint: {
    plugins: ["typescript"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: [
      "**/dist/**",
      "**/coverage/**",
      "**/.next/**",
      "**/src/generated/**",
      "apps/worker/src/goldens/pixelmatch.js",
      "apps/web/vendor/**",
    ],
    overrides: [
      {
        files: ["**/*.test.ts", "**/*.spec.ts"],
        plugins: ["typescript", "vitest"],
      },
    ],
  },
  test: {
    passWithNoTests: true,
  },
  pack: {
    dts: true,
    sourcemap: true,
  },
  run: {
    cache: true,
  },
});
