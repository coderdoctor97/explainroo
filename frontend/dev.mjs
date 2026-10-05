// The studio, running locally: the API on a private port, then the Vite dev
// server (the page, with HMR) in front of it, proxying /api to the API.
//
//   npm run dev                 → http://localhost:5173
//   node bin/explainroo.js studio [--port 4000]
//
// The API only ever listens on 127.0.0.1, so it is never reachable from
// another machine; the page is the only way in, and it talks to its own
// origin. Set STUDIO_ALLOWED_HOSTS (comma separated) or
// STUDIO_ALLOW_ALL_HOSTS=1 when running behind a proxy or a tunnel.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStudioApi } from './server/api.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startStudio({ port = Number(process.env.PORT || 5173), host = process.env.HOST || '0.0.0.0', quiet = false } = {}) {
  const api = await startStudioApi({ port: Number(process.env.STUDIO_API_PORT || 0) });
  process.env.STUDIO_API_URL = api.url;
  process.env.PORT = String(port);

  let createServer;
  try {
    ({ createServer } = await import('vite'));
  } catch {
    await api.close();
    throw new Error(
      'the studio needs its own dev dependencies. Run "npm install" in the explainroo folder first, then try again.',
    );
  }

  const server = await createServer({
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { host },
  });
  await server.listen();

  const urls = server.resolvedUrls;
  const local = (urls && urls.local && urls.local[0]) || `http://localhost:${port}/`;
  if (!quiet) {
    process.stdout.write(
      `\nexplainroo studio\n  page  ${local}\n  api   ${api.url} (proxied at /api)\n  files ${path.join(ROOT, 'studio-workspace')}\n\n`,
    );
    if (urls && urls.network) for (const u of urls.network) process.stdout.write(`  also  ${u}\n`);
  }

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => {});
    await api.close().catch(() => {});
  };
  const stop = async () => {
    await close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  return { url: local, api: api.url, close };
}
