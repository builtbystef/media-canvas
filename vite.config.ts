import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    "*.py": ["uv run ruff format", "uv run ruff check --fix"],
  },
  fmt: {
    // Machine-written files keep their generators' formatting so the CI
    // contract job can diff regenerated output against what's committed.
    // .beaver issue files are managed by the beaver CLI, not formatted here.
    ignorePatterns: [
      "**/src/generated/**",
      "**/openapi.json",
      ".beaver/**",
      ".agents/**",
      ".claude/**",
      ".pi/**",
      // Vendored pixelmatch 7.2.0 — keep the upstream text, not ours.
      "apps/worker/src/goldens/pixelmatch.js",
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
    ],
    overrides: [
      {
        // `plugins` in an override replaces the base list, so repeat it.
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
