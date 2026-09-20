import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { attachDatabasePool } from '@neon/functions';
import { Pool, type QueryResultRow } from 'pg';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

const SESSION_HOURS = 8;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RATE_LOGIN_MAX = 20;
const RATE_LOGIN_WINDOW_SEC = 300;
const BCRYPT_ROUNDS = 14;

const ROLES = {
  owner: { label: 'Owner', can: { vote: true, create: true, viewAll: true, close: true, team: true, logs: true } },
  manager: { label: 'Gerente', can: { vote: false, create: true, viewAll: true, close: false, team: false, logs: false } },
  member: { label: 'Membro', can: { vote: true, create: false, viewAll: false, close: false, team: false, logs: false } },
} as const;

type Role = keyof typeof ROLES;

type UserRow = {
  id: string;
  user_key: string;
  name: string;
  role: Role;
  code_hash: string;
  is_active: boolean;
  failed_attempts: number;
  locked_until: Date | null;
};

type SessionUser = {
  id: string;
  key: string;
  name: string;
  role: Role;
  sessionId: string;
};

type Variables = {
  user: SessionUser;
  reqMeta: { ip: string; ua: string; method: string; path: string };
};

/* -------------------------------------------------------------------------- */
/* Database                                                                   */
/* -------------------------------------------------------------------------- */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : undefined,
});

try {
  attachDatabasePool(pool);
} catch {
  /* local node without @neon/functions attach is fine */
}

async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

/* -------------------------------------------------------------------------- */
/* Crypto / helpers                                                           */
/* -------------------------------------------------------------------------- */

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

function clientIp(req: Request) {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]!.trim().slice(0, 64);
  return req.headers.get('cf-connecting-ip') || 'unknown';
}

function canOf(role: Role) {
  return ROLES[role].can;
}

function isLuaOwner(u: SessionUser) {
  return u.key === 'lua' && u.role === 'owner';
}

function jsonError(c: { json: (b: unknown, s?: number) => Response }, status: number, error: string) {
  return c.json({ ok: false, error }, status);
}

const FORBIDDEN = /['"`;\\<>=#]|--|\/\*|\*\//;

function cleanText(s: string) {
  return s.replace(FORBIDDEN, '').trim();
}

async function audit(input: {
  actor?: SessionUser | null;
  action: string;
  severity?: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  success?: boolean;
  ip?: string;
  ua?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await q(
      `INSERT INTO audit_logs
        (actor_user_id, actor_key, actor_name, actor_role, action, severity, success,
         ip, user_agent, method, path, status_code, resource_type, resource_id, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        input.actor?.id ?? null,
        input.actor?.key ?? null,
        input.actor?.name ?? null,
        input.actor?.role ?? null,
        input.action,
        input.severity ?? 'info',
        input.success !== false,
        input.ip ?? null,
        input.ua ?? null,
        input.method ?? null,
        input.path ?? null,
        input.statusCode ?? null,
        input.resourceType ?? null,
        input.resourceId ?? null,
        JSON.stringify(input.details ?? {}),
      ]
    );
  } catch (e) {
    console.error('audit_failed', e);
  }
}

async function rateLimit(bucket: string, max: number, windowSec: number) {
  const { rows } = await q<{ count: number; window_start: Date }>(
    `INSERT INTO rate_limits (bucket, count, window_start)
     VALUES ($1, 1, now())
     ON CONFLICT (bucket) DO UPDATE SET
       count = CASE
         WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval THEN 1
         ELSE rate_limits.count + 1
       END,
       window_start = CASE
         WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval THEN now()
         ELSE rate_limits.window_start
       END
     RETURNING count, window_start`,
    [bucket, String(windowSec)]
  );
  return (rows[0]?.count ?? 1) <= max;
}

async function getUserFromAuth(header: string | undefined): Promise<SessionUser | null> {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (token.length < 20 || token.length > 200) return null;
  const tokenHash = sha256(token);
  const { rows } = await q<UserRow & { session_id: string }>(
    `SELECT u.id, u.user_key, u.name, u.role, u.code_hash, u.is_active, u.failed_attempts, u.locked_until,
            s.id AS session_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.is_active = true
     LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;
  await q(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id]);
  return {
    id: row.id,
    key: row.user_key,
    name: row.name,
    role: row.role,
    sessionId: row.session_id,
  };
}

async function voters() {
  const { rows } = await q<{ id: string; user_key: string; name: string; role: Role }>(
    `SELECT id, user_key, name, role FROM users WHERE is_active = true AND role IN ('owner','member')`
  );
  return rows;
}

async function sweepExpired(actor: SessionUser | null, meta: { ip: string; ua: string }) {
  const { rows } = await q<{ id: string }>(
    `UPDATE votes SET status = 'encerrada', encerrada_em = now()
     WHERE status = 'aberta' AND prazo < CURRENT_DATE
     RETURNING id`
  );
  for (const r of rows) {
    await audit({
      actor,
      action: 'vote.auto_close_expired',
      severity: 'info',
      ip: meta.ip,
      ua: meta.ua,
      resourceType: 'vote',
      resourceId: r.id,
      details: { reason: 'prazo_vencido' },
    });
  }

  const voterIds = (await voters()).map((v) => v.id);
  if (voterIds.length === 0) return;

  const { rows: open } = await q<{ id: string; n: string }>(
    `SELECT v.id, COUNT(b.id)::text AS n
     FROM votes v
     LEFT JOIN ballots b ON b.vote_id = v.id
     WHERE v.status = 'aberta'
     GROUP BY v.id`
  );
  for (const v of open) {
    if (Number(v.n) >= voterIds.length) {
      await q(`UPDATE votes SET status = 'encerrada', encerrada_em = now() WHERE id = $1 AND status = 'aberta'`, [v.id]);
      await audit({
        actor,
        action: 'vote.auto_close_complete',
        ip: meta.ip,
        ua: meta.ua,
        resourceType: 'vote',
        resourceId: v.id,
        details: { reason: 'todos_votaram' },
      });
    }
  }
}

function mapVote(row: Record<string, unknown>, ballots: Record<string, unknown>[], viewer: SessionUser) {
  const can = canOf(viewer.role);
  const votos: Record<string, unknown> = {};
  for (const b of ballots) {
    const key = String(b.user_key);
    if (can.viewAll || key === viewer.key || row.status === 'encerrada') {
      if (can.viewAll || key === viewer.key) {
        votos[key] = {
          opcao: b.opcao,
          justificativa: can.viewAll || key === viewer.key ? b.justificativa : undefined,
          em: b.created_at,
          nome: b.name,
        };
      }
    }
  }
  // members see only own ballot detail on open votes; results on closed
  if (!can.viewAll && row.status === 'aberta') {
    const mine = ballots.find((b) => b.user_key === viewer.key);
    return {
      id: row.id,
      titulo: row.titulo,
      descricao: row.descricao,
      autor: row.autor_key,
      autorNome: row.autor_nome,
      criadoEm: row.criado_em,
      prazo: row.prazo,
      status: row.status,
      encerradaEm: row.encerrada_em,
      votos: mine
        ? {
            [viewer.key]: {
              opcao: mine.opcao,
              justificativa: mine.justificativa,
              em: mine.created_at,
              nome: mine.name,
            },
          }
        : {},
      progresso: { responded: ballots.length, total: null },
    };
  }
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao,
    autor: row.autor_key,
    autorNome: row.autor_nome,
    criadoEm: row.criado_em,
    prazo: row.prazo,
    status: row.status,
    encerradaEm: row.encerrada_em,
    votos: Object.fromEntries(
      ballots.map((b) => [
        String(b.user_key),
        {
          opcao: b.opcao,
          justificativa: b.justificativa,
          em: b.created_at,
          nome: b.name,
        },
      ])
    ),
    progresso: { responded: ballots.length, total: null },
  };
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

const app = new Hono<{ Variables: Variables }>();

app.use('*', secureHeaders({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use('*', async (c, next) => {
  const origin = process.env.APP_ORIGIN || '*';
  return cors({
    origin: origin === '*' ? '*' : origin.split(',').map((s) => s.trim()),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 600,
  })(c, next);
});

app.use('/api/*', async (c, next) => {
  const meta = {
    ip: clientIp(c.req.raw),
    ua: (c.req.header('user-agent') || '').slice(0, 300),
    method: c.req.method,
    path: c.req.path,
  };
  c.set('reqMeta', meta);
  await next();
});

async function requireAuth(c: any, next: () => Promise<void>) {
  const user = await getUserFromAuth(c.req.header('Authorization'));
  if (!user) {
    await audit({
      action: 'auth.denied',
      severity: 'warn',
      success: false,
      ip: c.get('reqMeta')?.ip,
      ua: c.get('reqMeta')?.ua,
      method: c.req.method,
      path: c.req.path,
      statusCode: 401,
    });
    return jsonError(c, 401, 'Não autenticado.');
  }
  c.set('user', user);
  await next();
}

function requirePerm(perm: keyof (typeof ROLES)['owner']['can']) {
  return async (c: any, next: () => Promise<void>) => {
    const user = c.get('user') as SessionUser;
    if (!canOf(user.role)[perm]) {
      await audit({
        actor: user,
        action: 'auth.forbidden',
        severity: 'warn',
        success: false,
        ip: c.get('reqMeta').ip,
        ua: c.get('reqMeta').ua,
        method: c.req.method,
        path: c.req.path,
        statusCode: 403,
        details: { perm },
      });
      return jsonError(c, 403, 'Sem permissão.');
    }
    await next();
  };
}

/* Health */
app.get('/api/health', async (c) => {
  await q('SELECT 1');
  return c.json({ ok: true, ts: new Date().toISOString() });
});

/* Login */
const loginSchema = z.object({
  code: z.string().min(8).max(64),
});

app.post('/api/login', async (c) => {
  const meta = c.get('reqMeta');
  const allowed = await rateLimit(`login:ip:${meta.ip}`, RATE_LOGIN_MAX, RATE_LOGIN_WINDOW_SEC);
  if (!allowed) {
    await audit({
      action: 'auth.rate_limited',
      severity: 'critical',
      success: false,
      ip: meta.ip,
      ua: meta.ua,
      method: 'POST',
      path: '/api/login',
      statusCode: 429,
    });
    return jsonError(c, 429, 'Muitas tentativas. Aguarde alguns minutos.');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 400, 'JSON inválido.');
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    await audit({
      action: 'auth.login_invalid_payload',
      severity: 'warn',
      success: false,
      ip: meta.ip,
      ua: meta.ua,
      statusCode: 400,
    });
    return jsonError(c, 400, 'Código inválido.');
  }

  const code = parsed.data.code.trim();
  const codeFp = sha256(code).slice(0, 16);

  const { rows: users } = await q<UserRow>(
    `SELECT id, user_key, name, role, code_hash, is_active, failed_attempts, locked_until
     FROM users WHERE is_active = true`
  );

  let matched: UserRow | null = null;
  for (const u of users) {
    if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
      continue;
    }
    const ok = await bcrypt.compare(code, u.code_hash);
    if (ok) {
      matched = u;
      break;
    }
  }

  if (!matched) {
    // increment failed attempts on all? No — only fingerprint log
    await audit({
      action: 'auth.login_failed',
      severity: 'warn',
      success: false,
      ip: meta.ip,
      ua: meta.ua,
      method: 'POST',
      path: '/api/login',
      statusCode: 401,
      details: { codeFingerprint: codeFp },
    });
    return jsonError(c, 401, 'Código inválido.');
  }

  if (matched.locked_until && new Date(matched.locked_until).getTime() > Date.now()) {
    await audit({
      actor: { id: matched.id, key: matched.user_key, name: matched.name, role: matched.role, sessionId: '' },
      action: 'auth.login_locked',
      severity: 'warn',
      success: false,
      ip: meta.ip,
      ua: meta.ua,
      statusCode: 423,
    });
    return jsonError(c, 423, 'Conta temporariamente bloqueada.');
  }

  // verify again with constant path — already matched
  const token = newToken();
  const tokenHash = sha256(token);
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);

  await q(`UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now(), updated_at = now() WHERE id = $1`, [
    matched.id,
  ]);
  const sess = await q<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [matched.id, tokenHash, meta.ip, meta.ua, expires.toISOString()]
  );

  const user: SessionUser = {
    id: matched.id,
    key: matched.user_key,
    name: matched.name,
    role: matched.role,
    sessionId: sess.rows[0]!.id,
  };

  await audit({
    actor: user,
    action: 'auth.login_success',
    severity: 'info',
    success: true,
    ip: meta.ip,
    ua: meta.ua,
    method: 'POST',
    path: '/api/login',
    statusCode: 200,
    details: { sessionId: user.sessionId, expiresAt: expires.toISOString() },
  });

  return c.json({
    ok: true,
    token,
    expiresAt: expires.toISOString(),
    user: {
      key: user.key,
      name: user.name,
      role: user.role,
      label: ROLES[user.role].label,
      can: canOf(user.role),
    },
  });
});

app.post('/api/logout', requireAuth, async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');
  await q(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [user.sessionId]);
  await audit({
    actor: user,
    action: 'auth.logout',
    ip: meta.ip,
    ua: meta.ua,
    method: 'POST',
    path: '/api/logout',
    statusCode: 200,
  });
  return c.json({ ok: true });
});

app.get('/api/me', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({
    ok: true,
    user: {
      key: user.key,
      name: user.name,
      role: user.role,
      label: ROLES[user.role].label,
      can: canOf(user.role),
    },
  });
});

/* Votes */
app.get('/api/votes', requireAuth, async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');
  await sweepExpired(user, meta);

  const status = c.req.query('status'); // aberta | encerrada | all
  const params: unknown[] = [];
  let where = 'WHERE 1=1';
  if (status === 'aberta' || status === 'encerrada') {
    params.push(status);
    where += ` AND v.status = $${params.length}`;
  }

  const { rows } = await q(
    `SELECT v.id, v.titulo, v.descricao, v.prazo, v.status, v.criado_em, v.encerrada_em,
            a.user_key AS autor_key, a.name AS autor_nome
     FROM votes v
     JOIN users a ON a.id = v.autor_id
     ${where}
     ORDER BY v.criado_em DESC`,
    params
  );

  const vs = await voters();
  const out = [];
  for (const row of rows) {
    const { rows: ballots } = await q(
      `SELECT b.opcao, b.justificativa, b.created_at, u.user_key, u.name
       FROM ballots b JOIN users u ON u.id = b.user_id
       WHERE b.vote_id = $1`,
      [row.id]
    );
    const mapped = mapVote(row, ballots, user);
    mapped.progresso = { responded: ballots.length, total: vs.length };
    out.push(mapped);
  }

  await audit({
    actor: user,
    action: 'vote.list',
    severity: 'debug',
    ip: meta.ip,
    ua: meta.ua,
    path: '/api/votes',
    details: { count: out.length, status: status || 'all' },
  });

  return c.json({ ok: true, votes: out, voters: vs.map((v) => ({ key: v.user_key, name: v.name })) });
});

app.get('/api/votes/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');
  await sweepExpired(user, meta);
  const id = c.req.param('id');

  const { rows } = await q(
    `SELECT v.id, v.titulo, v.descricao, v.prazo, v.status, v.criado_em, v.encerrada_em,
            a.user_key AS autor_key, a.name AS autor_nome
     FROM votes v JOIN users a ON a.id = v.autor_id WHERE v.id = $1`,
    [id]
  );
  if (!rows[0]) return jsonError(c, 404, 'Votação não encontrada.');

  const { rows: ballots } = await q(
    `SELECT b.opcao, b.justificativa, b.created_at, u.user_key, u.name
     FROM ballots b JOIN users u ON u.id = b.user_id WHERE b.vote_id = $1`,
    [id]
  );
  const vs = await voters();
  const mapped = mapVote(rows[0], ballots, user);
  mapped.progresso = { responded: ballots.length, total: vs.length };

  await audit({
    actor: user,
    action: 'vote.view',
    severity: 'debug',
    ip: meta.ip,
    ua: meta.ua,
    resourceType: 'vote',
    resourceId: id,
  });

  return c.json({ ok: true, vote: mapped, voters: vs.map((v) => ({ key: v.user_key, name: v.name })) });
});

const createSchema = z.object({
  titulo: z.string().min(5).max(80),
  descricao: z.string().min(10).max(500),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

app.post('/api/votes', requireAuth, requirePerm('create'), async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 400, 'JSON inválido.');
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'Dados inválidos.');

  const titulo = cleanText(parsed.data.titulo);
  const descricao = cleanText(parsed.data.descricao);
  if (titulo.length < 5 || descricao.length < 10) return jsonError(c, 400, 'Texto inválido.');
  if (FORBIDDEN.test(parsed.data.titulo) || FORBIDDEN.test(parsed.data.descricao)) {
    await audit({
      actor: user,
      action: 'vote.create_rejected_chars',
      severity: 'warn',
      success: false,
      ip: meta.ip,
      ua: meta.ua,
    });
    return jsonError(c, 400, 'Caracteres não permitidos.');
  }

  const today = new Date().toISOString().slice(0, 10);
  if (parsed.data.prazo < today) return jsonError(c, 400, 'Prazo deve ser hoje ou futuro.');

  const { rows } = await q<{ id: string }>(
    `INSERT INTO votes (titulo, descricao, autor_id, prazo) VALUES ($1,$2,$3,$4) RETURNING id`,
    [titulo, descricao, user.id, parsed.data.prazo]
  );

  await audit({
    actor: user,
    action: 'vote.create',
    severity: 'info',
    ip: meta.ip,
    ua: meta.ua,
    resourceType: 'vote',
    resourceId: rows[0]!.id,
    details: { titulo, prazo: parsed.data.prazo },
  });

  return c.json({ ok: true, id: rows[0]!.id });
});

const ballotSchema = z.object({
  opcao: z.enum(['favor', 'contra', 'abstencao']),
  justificativa: z.string().min(5).max(300),
});

app.post('/api/votes/:id/ballot', requireAuth, requirePerm('vote'), async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 400, 'JSON inválido.');
  }
  const parsed = ballotSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'Dados inválidos.');

  const just = cleanText(parsed.data.justificativa);
  if (just.length < 5) return jsonError(c, 400, 'Justificativa inválida.');
  if (FORBIDDEN.test(parsed.data.justificativa)) return jsonError(c, 400, 'Caracteres não permitidos.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const voteRes = await client.query(`SELECT id, status FROM votes WHERE id = $1 FOR UPDATE`, [id]);
    const vote = voteRes.rows[0];
    if (!vote || vote.status !== 'aberta') {
      await client.query('ROLLBACK');
      await audit({
        actor: user,
        action: 'vote.ballot_rejected',
        severity: 'warn',
        success: false,
        ip: meta.ip,
        ua: meta.ua,
        resourceType: 'vote',
        resourceId: id,
        details: { reason: 'not_open' },
      });
      return jsonError(c, 409, 'Votação indisponível.');
    }
    try {
      await client.query(
        `INSERT INTO ballots (vote_id, user_id, opcao, justificativa) VALUES ($1,$2,$3,$4)`,
        [id, user.id, parsed.data.opcao, just]
      );
    } catch {
      await client.query('ROLLBACK');
      return jsonError(c, 409, 'Você já votou nesta pauta.');
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await audit({
    actor: user,
    action: 'vote.ballot_cast',
    severity: 'info',
    ip: meta.ip,
    ua: meta.ua,
    resourceType: 'vote',
    resourceId: id,
    details: { opcao: parsed.data.opcao },
  });

  await sweepExpired(user, meta);
  return c.json({ ok: true });
});

app.post('/api/votes/:id/close', requireAuth, requirePerm('close'), async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');
  const id = c.req.param('id');
  const { rowCount } = await q(
    `UPDATE votes SET status = 'encerrada', encerrada_em = now()
     WHERE id = $1 AND status = 'aberta'`,
    [id]
  );
  if (!rowCount) return jsonError(c, 409, 'Não foi possível encerrar.');

  await audit({
    actor: user,
    action: 'vote.close',
    severity: 'info',
    ip: meta.ip,
    ua: meta.ua,
    resourceType: 'vote',
    resourceId: id,
  });
  return c.json({ ok: true });
});

/* Team */
app.get('/api/team', requireAuth, requirePerm('team'), async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');
  const { rows } = await q(
    `SELECT u.user_key, u.name, u.role, u.last_login_at, u.is_active,
            (SELECT COUNT(*)::int FROM ballots b WHERE b.user_id = u.id) AS votos
     FROM users u ORDER BY u.name`
  );
  await audit({
    actor: user,
    action: 'team.view',
    severity: 'debug',
    ip: meta.ip,
    ua: meta.ua,
  });
  return c.json({
    ok: true,
    members: rows.map((r) => ({
      key: r.user_key,
      name: r.name,
      role: r.role,
      label: ROLES[r.role as Role].label,
      perms: Object.entries(ROLES[r.role as Role].can)
        .filter(([, v]) => v)
        .map(([k]) => k),
      lastLoginAt: r.last_login_at,
      active: r.is_active,
      votos: r.votos,
      canVote: canOf(r.role as Role).vote,
    })),
  });
});

/* Logs — APENAS Lua (owner) */
app.get('/api/logs', requireAuth, async (c) => {
  const user = c.get('user');
  const meta = c.get('reqMeta');

  if (!isLuaOwner(user)) {
    await audit({
      actor: user,
      action: 'logs.denied',
      severity: 'critical',
      success: false,
      ip: meta.ip,
      ua: meta.ua,
      statusCode: 403,
      details: { reason: 'only_lua_owner' },
    });
    return jsonError(c, 403, 'Acesso aos logs restrito à Lua.');
  }

  const limit = Math.min(Number(c.req.query('limit') || 100), 500);
  const offset = Math.max(Number(c.req.query('offset') || 0), 0);
  const action = c.req.query('action');
  const severity = c.req.query('severity');
  const qtext = c.req.query('q');

  const params: unknown[] = [];
  const wheres: string[] = [];
  if (action) {
    params.push(action);
    wheres.push(`action = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    wheres.push(`severity = $${params.length}`);
  }
  if (qtext) {
    params.push(`%${qtext.slice(0, 80)}%`);
    wheres.push(`(actor_key ILIKE $${params.length} OR actor_name ILIKE $${params.length} OR action ILIKE $${params.length} OR ip ILIKE $${params.length} OR details::text ILIKE $${params.length})`);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

  params.push(limit);
  params.push(offset);

  const { rows } = await q(
    `SELECT id, created_at, actor_key, actor_name, actor_role, action, severity, success,
            ip, user_agent, method, path, status_code, resource_type, resource_id, details
     FROM audit_logs
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countRes = await q<{ n: string }>(`SELECT COUNT(*)::text AS n FROM audit_logs ${where}`, params.slice(0, -2));

  await audit({
    actor: user,
    action: 'logs.view',
    severity: 'info',
    ip: meta.ip,
    ua: meta.ua,
    details: { limit, offset, action, severity, q: qtext || null, returned: rows.length },
  });

  return c.json({
    ok: true,
    total: Number(countRes.rows[0]?.n || 0),
    logs: rows,
  });
});

app.get('/api/logs/stats', requireAuth, async (c) => {
  const user = c.get('user');
  if (!isLuaOwner(user)) return jsonError(c, 403, 'Acesso aos logs restrito à Lua.');

  const { rows: byAction } = await q(
    `SELECT action, COUNT(*)::int AS n FROM audit_logs
     WHERE created_at > now() - interval '7 days'
     GROUP BY action ORDER BY n DESC LIMIT 30`
  );
  const { rows: bySeverity } = await q(
    `SELECT severity, COUNT(*)::int AS n FROM audit_logs
     WHERE created_at > now() - interval '7 days'
     GROUP BY severity`
  );
  const { rows: fails } = await q(
    `SELECT COUNT(*)::int AS n FROM audit_logs
     WHERE success = false AND created_at > now() - interval '24 hours'`
  );
  const { rows: logins } = await q(
    `SELECT COUNT(*)::int AS n FROM audit_logs
     WHERE action = 'auth.login_success' AND created_at > now() - interval '24 hours'`
  );

  return c.json({
    ok: true,
    stats: {
      byAction,
      bySeverity,
      fails24h: fails[0]?.n ?? 0,
      logins24h: logins[0]?.n ?? 0,
    },
  });
});

app.onError(async (err, c) => {
  console.error(err);
  try {
    await audit({
      action: 'system.unhandled_error',
      severity: 'error',
      success: false,
      ip: clientIp(c.req.raw),
      ua: c.req.header('user-agent') || '',
      method: c.req.method,
      path: c.req.path,
      statusCode: 500,
      details: { message: err instanceof Error ? err.message : 'error' },
    });
  } catch { /* ignore */ }
  return c.json({ ok: false, error: 'Erro interno.' }, 500);
});

app.notFound((c) => c.json({ ok: false, error: 'Não encontrado.' }, 404));

export default app;
