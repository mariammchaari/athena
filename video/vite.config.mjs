import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "../frontend/node_modules/@vitejs/plugin-react/dist/index.js";
const here = path.dirname(fileURLToPath(import.meta.url));
export default {
  root: path.join(here, "../frontend"),
  cacheDir: path.join(here, "build/vite"),
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime", "katex"] },
  server: { port: 5174, strictPort: true, hmr: false, fs: { allow: [path.join(here, "..")] },
    proxy: { "/api": { target: "http://127.0.0.1:8003", changeOrigin: true } } },
};
