import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0b4f6c",
        accent: "#d97706",
        surface: "#f3f7f9"
      }
    }
  },
  plugins: []
};

export default config;
