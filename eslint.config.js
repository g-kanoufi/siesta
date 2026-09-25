import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/build",
      "**/.expo",
      "**/.astro",
      "**/coverage",
      "apps/mobile/ios",
      "apps/mobile/android",
      "apps/mobile/targets/*/Domain",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["packages/test-vectors/src/**"],
    rules: { "no-console": "off" },
  },
  {
    // Expo/Metro/target configs are CommonJS by convention — allow require/module.
    files: ["apps/**/*.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "writable",
        process: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
