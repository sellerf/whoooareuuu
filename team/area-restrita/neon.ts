import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      api: {
        name: "Linarc Área Restrita API",
        source: "./functions/api.ts",
        env: {
          SESSION_SECRET: process.env.SESSION_SECRET!,
          APP_ORIGIN: process.env.APP_ORIGIN || "*",
        },
      },
    },
  },
});
