import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Ensure the tsx TypeScript loader is active so that TypeScript modules,
// relative .js-to-.ts file resolution, and CommonJS libraries execute seamlessly
// when started via "node server.ts" in Cloud Run production containers.
const hasTsx = Boolean(
  process.env.__TSX_ACTIVE__ === 'true' ||
  process.execArgv.some((a) => a.includes('tsx')) ||
  (typeof process.argv[0] === 'string' && process.argv[0].includes('tsx'))
);

if (!hasTsx) {
  process.env.__TSX_ACTIVE__ = 'true';
  const thisFile = fileURLToPath(import.meta.url);
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', thisFile, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: process.env,
    }
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.on('SIGINT', () => child.kill('SIGINT'));
} else {
  // Execute the full Express application with all API routers and Vite static handler
  await import('./serverApp.js');
}
