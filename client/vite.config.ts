import { defineConfig, type UserConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  worker: { format: "es" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
  server: {
    proxy: {
      "/api": {
        // SRCLY_API_PORT lets a second dev server run beside the default one.
        target: `http://localhost:${process.env.SRCLY_API_PORT ?? 8000}`,
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  optimizeDeps: {
    // required for solid-markdown to work
    // https://github.com/andi23rosca/solid-markdown/issues/33#issuecomment-2612454745
    include: ["solid-markdown > micromark", "solid-markdown > unified"],
  },
} as UserConfig);
