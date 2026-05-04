import { getPrismaForEnv } from '@/lib/db';
import { sha256Hex } from '@/lib/crypto';
import { permissionRepo } from './repositories/permission.repo';
import { createContext, type AppContext, type AuthUser } from './context';

const SESSION_COOKIE = 'sid';

function parseCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/**
 * Tries to obtain Cloudflare Workers env (containing D1 binding) when
 * running on Pages/Workers. Returns undefined in Node.js dev/test so the
 * caller falls back to the SQLite singleton.
 *
 * Imports are dynamic + lazy so that pure Node.js test runs don't have
 * to bundle the cloudflare adapter.
 */
async function getCloudflareEnv(): Promise<{ DB?: D1Database } | undefined> {
  try {
    const mod: { getRequestContext?: () => { env: { DB?: D1Database } } } =
      await import('@cloudflare/next-on-pages');
    return mod.getRequestContext?.().env;
  } catch {
    return undefined;
  }
}

/**
 * Returns a Prisma client appropriate for the current request env (D1 in
 * Workers, SQLite singleton elsewhere). Use from edge route handlers that
 * don't need session resolution (e.g. /api/auth/login).
 */
export async function getPrismaForRequest(): Promise<import('@prisma/client').PrismaClient> {
  const env = await getCloudflareEnv();
  return getPrismaForEnv(env?.DB);
}

export async function buildAppContextFromRequest(req: Request): Promise<AppContext> {
  const env = await getCloudflareEnv();
  const prisma = getPrismaForEnv(env?.DB);

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;
  const cookieHeader = req.headers.get('cookie');
  const token = parseCookie(cookieHeader, SESSION_COOKIE);
  let user: AuthUser | undefined;
  if (token) {
    const tokenHash = await sha256Hex(token);
    const session = await prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
    });
    if (session && session.user.deletedAt === null) {
      const u = session.user;
      const isSuperAdmin = u.roles.some((r) => r.role.code === 'ROLE_SUPER_ADMIN');
      const perms = await permissionRepo.listForUser(prisma, u.id);
      user = {
        id: u.id,
        username: u.username,
        realName: u.realName,
        status: u.status,
        mustChangePassword: u.mustChangePassword,
        isSuperAdmin,
        permissions: new Set(perms),
      };
    }
  }
  return createContext({ user, ip, userAgent, prisma });
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
