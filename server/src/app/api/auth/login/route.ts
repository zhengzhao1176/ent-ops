import { NextResponse } from 'next/server';
import { authService } from '@server/services/auth.service';
import { createContext } from '@server/context';
import { SESSION_COOKIE_NAME, getPrismaForRequest } from '@server/http-context';
import { LoginInput } from '@/contracts/user/auth.contract';

// 'edge' runtime for Cloudflare Workers compatibility (next-on-pages).
// Locally with `next dev`/`next start`, edge runs in a Node-based simulator,
// so existing dev/test workflows still work.
export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = LoginInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: parsed.error.message }, { status: 400 });
    }
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;
    const prisma = await getPrismaForRequest();
    const ctx = createContext({ ip, userAgent, prisma });
    const result = await authService.login(ctx, parsed.data);
    const res = NextResponse.json({
      ok: true,
      user: {
        id: String(result.user.id),
        username: result.user.username,
        realName: result.user.realName,
        mustChangePassword: result.user.mustChangePassword,
      },
    });
    res.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    });
    return res;
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'INTERNAL';
    const message = (e as Error).message ?? 'login failed';
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: code, message }, { status });
  }
}
