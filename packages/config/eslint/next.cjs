module.exports = {
  extends: ["next/core-web-vitals", "next/typescript", "prettier"],
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  rules: {
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports"
      }
    ]
  }
};
