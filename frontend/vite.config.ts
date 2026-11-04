import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    fs: {
      // Allow importing the single shared vesting formula from ../shared.
      allow: [workspaceRoot],
    },
    proxy: {
      // The public RPC does not guarantee browser CORS, so reads go same-origin.
      "/rpc": {
        target: "https://rpc.bohr.life",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, "/"),
      },
    },
  },
});
