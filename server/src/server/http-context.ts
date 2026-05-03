import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
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

export async function buildAppContextFromRequest(req: Request): Promise<AppContext> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;
  const cookieHeader = req.headers.get('cookie');
  const token = parseCookie(cookieHeader, SESSION_COOKIE);
  let user: AuthUser | undefined;
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
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
