import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, "../static/dist"),
        emptyOutDir: true,
        assetsDir: "assets",
        rollupOptions: {
            output: {
                entryFileNames: "app.js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith(".css")) {
                        return "app.css";
                    }
                    return "assets/[name][extname]";
                },
            },
        },
    },
});
