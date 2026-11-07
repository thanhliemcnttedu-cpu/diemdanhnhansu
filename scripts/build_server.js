import { build } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const NODE_BUILTINS = [
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'fs/promises',
  'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path',
  'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
];

async function buildServer() {
  console.log('🔨 Đang biên dịch server.ts thành Standalone Production Server...');
  const outDir = path.resolve(root, 'dist-server');
  
  await build({
    configFile: false,
    publicDir: false,
    ssr: {
      noExternal: true, // Bundle toàn bộ dependencies thực thi (express, @supabase, dotenv...)
    },
    build: {
      ssr: path.resolve(root, 'server.ts'),
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        external: (id) => {
          if (id === 'vite' || id.startsWith('vite/') || id === 'fsevents') return true;
          if (id.startsWith('node:')) return true;
          return NODE_BUILTINS.includes(id);
        },
        output: {
          entryFileNames: 'server.js',
          format: 'es',
          inlineDynamicImports: true
        }
      }
    }
  });

  // Sao chép bản sao vào thư mục gốc server.js
  const compiledFile = path.resolve(outDir, 'server.js');
  const rootTarget = path.resolve(root, 'server.js');
  if (fs.existsSync(compiledFile)) {
    fs.copyFileSync(compiledFile, rootTarget);
    console.log('📋 Đã đồng bộ bản sao server.js tại thư mục gốc.');
  }

  console.log('✅ Biên dịch Standalone Backend Server hoàn tất thành công 100%!');
}

buildServer().catch((err) => {
  console.error('❌ Lỗi biên dịch server:', err);
  process.exit(1);
});
