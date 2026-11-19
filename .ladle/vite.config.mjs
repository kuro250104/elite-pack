import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const local = (path) => fileURLToPath(new URL(path, import.meta.url));

// Ladle renders components outside Next.js: framework modules are replaced by plain React equivalents.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: local("../src/") },
      { find: /^next\/link$/, replacement: local("./mocks/next-link.tsx") },
      { find: /^next\/image$/, replacement: local("./mocks/next-image.tsx") },
    ],
  },
});
