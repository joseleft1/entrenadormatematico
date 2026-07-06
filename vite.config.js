import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // rutas relativas: funciona igual en GitHub Pages, Cloudflare Pages o cualquier subcarpeta
});
