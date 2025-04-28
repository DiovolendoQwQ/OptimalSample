import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // Import path module

// https://vitejs.dev/config/
export default defineConfig({
  // Define the root directory for the dev server and index.html lookup
  root: path.resolve(__dirname, 'src/renderer'), // Point to the directory containing index.html
  plugins: [react()],
  // Define base directory for asset loading.
  // Restore relative base for Electron file:// protocol loading.
  base: './', // Restore base relative for Electron
  // Configure build options
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'), // Keep output relative to project root
    emptyOutDir: true,      // Clear the directory before building
    // sourcemap: true,     // Enable source maps for easier debugging (optional)
  },
  // Configure development server options
  server: {
    port: 5173, // Match the port used in main/index.ts for development
    strictPort: true, // Exit if port is already in use
    // Since root is now 'src/renderer', the server will serve from there.
    // We might not need special proxy settings unless APIs are elsewhere.
  },
  // Resolve aliases (must match tsconfig.json)
  resolve: {
    alias: {
      // Adjust alias to be relative to the new root or use absolute paths
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
