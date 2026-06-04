import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["main/main.ts", "main/preload.ts"],
    format: ["cjs"],
    clean: true,
    outDir: "dist-electron",
    minify: false,
    external: ["electron"],
});