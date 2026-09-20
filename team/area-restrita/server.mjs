import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

for (const file of ['.env.local', '.env']) {
  const p = resolve(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] == null) process.env[k] = v;
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente. Rode: neon link');
  process.exit(1);
}
if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET ausente no .env.local');
  process.exit(1);
}

const { default: app } = await import('./functions/api.ts');

app.get('/app.js', serveStatic({ root: './public', rewriteRequestPath: () => '/app.js' }));
app.get('/', serveStatic({ root: './public', rewriteRequestPath: () => '/index.html' }));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Linarc Área Restrita → http://localhost:${port}`);
});
