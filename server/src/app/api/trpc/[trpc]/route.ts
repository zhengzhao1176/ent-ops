import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@server/routers/_app';
import { buildAppContextFromRequest, SESSION_COOKIE_NAME } from '@server/http-context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = async (req: Request) => {
  const res = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => buildAppContextFromRequest(req),
    onError({ error, path }) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('tRPC error', path, error.code, error.message);
      }
    },
    responseMeta({ ctx, paths, type, errors }) {
      void ctx;
      void paths;
      void type;
      void errors;
      return {};
    },
  });

  // After login mutation, set session cookie if response body indicates a token.
  // Simpler: handle login server-side via dedicated route below.
  return res;
};

export { handler as GET, handler as POST };

// Simple login API that sets the cookie. The client may also use trpc.auth.login
// directly and then post token to /api/auth/establish-session, but this combo is fine
// for one-trip browser flows.
export { SESSION_COOKIE_NAME };
