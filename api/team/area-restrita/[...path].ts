/**
 * Vercel Function entry point for /api/team/area-restrita/*.
 * The API implementation keeps its internal /api/* routes, so this adapter
 * removes the public prefix before passing the request to Hono.
 */
import { Hono } from 'hono';
import api from '../../../functions/api.js';

const entry = new Hono();
const publicPrefix = '/api/team/area-restrita';

entry.all('*', (c) => {
  const url = new URL(c.req.raw.url);
  if (!url.pathname.startsWith(publicPrefix)) {
    return c.json({ ok: false, error: 'Rota inválida.' }, 404);
  }
  url.pathname = '/api' + url.pathname.slice(publicPrefix.length);
  return api.fetch(new Request(url, c.req.raw));
});

export default entry;
