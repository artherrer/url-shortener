import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
	root: path.resolve(import.meta.dirname, "src/client"),
	plugins: [react(), tailwindcss()],
	server: {
		port: 5173,
		proxy: {
			"/api": {
				target: "http://localhost:8787",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: path.resolve(import.meta.dirname, "dist/client"),
		emptyOutDir: true,
	},
});
