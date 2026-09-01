import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  // The app is served by Zola as the page assets of content/starbattle-v2,
  // so every built URL is rooted at /starbattle-v2/build/.
  base: '/starbattle-v2/build/',

  // This app lives inside a repository with its own node_modules/workspaces.
  // Keep React on one module identity even when Vite follows nested or linked
  // dependency paths; two identities make hooks fail at runtime during HMR.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // `build/` is gitignored repo-wide and matches the other content workspaces.
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Stable names: index.md hardcodes the script/stylesheet URLs.
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
