import fs from 'fs';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function avatarScannerPlugin() {
  return {
    name: 'avatar-scanner-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/avatars-list', (_req: any, res: any) => {
        try {
          const supportedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.jfif', '.avif', '.gif']);
          const getFilesInDir = (subDir: string): string[] => {
            const fullPath = path.resolve(__dirname, 'public', 'avatars', subDir);
            if (!fs.existsSync(fullPath)) return [];
            try {
              const files = fs.readdirSync(fullPath);
              return files
                .filter(f => supportedExts.has(path.extname(f).toLowerCase()))
                .map(f => `/avatars/${subDir.replace(/\\/g, '/')}/${f}`);
            } catch (_) {
              return [];
            }
          };

          const result = {
            default: {
              boys: getFilesInDir('default/boys'),
              girls: getFilesInDir('default/girls')
            },
            real_demo: {
              boys: getFilesInDir('real_demo/boys'),
              girls: getFilesInDir('real_demo/girls')
            }
          };

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(JSON.stringify({ success: true, data: result }));
        } catch (error: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, message: error?.message }));
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), avatarScannerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore database files and git directories to prevent full page reloads when saving
      watch: {
        ignored: [
          '**/data/**',
          '**/data/classroom_database.json',
          '**/.git/**',
          '**/.agent/**',
          '**/dist/**',
          '**/dist-electron/**',
          '**/release/**',
          '**/*.tmp/**',
          '**/*.tmp',
          '**/*.exe',
          '**/*.json'
        ]
      },
    },
  };
});
