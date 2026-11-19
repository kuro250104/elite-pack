/** @type {import("@ladle/react").UserConfig} */
const config = {
  stories: "src/**/*.stories.tsx",
  viteConfig: ".ladle/vite.config.mjs",
  outDir: "build-ladle",
  addons: {
    // The game is dark-only: Ladle's theme switch would show unsupported light surfaces.
    theme: { enabled: false, defaultState: "dark" },
    width: { enabled: true, options: { "800x600": 800, mobile: 375, tablette: 768, bureau: 1280 }, defaultState: 0 },
    a11y: { enabled: true },
  },
};
export default config;
