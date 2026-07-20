import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  // Determine HMR configuration based on environment
  let hmrConfig: any = true;

  if (process.env.DISABLE_HMR === 'true') {
    hmrConfig = false;
  } else if (process.env.CODESPACE_NAME && process.env.CODESPACES === 'true') {
    // For GitHub Codespaces:
    // When accessed via Codespaces preview URL like https://codespace-name-PORT.preview.app.github.dev/
    // The browser needs to connect HMR to the SAME port it loaded the page from.
    // We use browser's window.location to auto-detect the correct port through Codespaces port forwarding.
    // This avoids hardcoding a specific port that might not match where Vite actually runs.
    hmrConfig = {
      protocol: 'wss', // Use WebSocket Secure for HTTPS-accessed Codespaces URLs
      // Omit host and port - let the Vite HMR client use window.location to auto-detect.
      // This ensures it connects to the same domain/port the page was loaded from.
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      hmr: hmrConfig,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Enable CORS for Codespaces forwarded URLs
      cors: true,
    },
  };
});
