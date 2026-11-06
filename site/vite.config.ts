import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  base: "/srcly/",
  plugins: [solid()],
  ssr: { noExternal: ["lucide-solid"] },
  build: { target: "es2022" },
});
