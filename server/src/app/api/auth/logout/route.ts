import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@server/http-context';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
  return res;
}
