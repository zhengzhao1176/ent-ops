import { router } from '../trpc';

// Stub root router. Sub-routers will be wired in Phase 1c.
export const appRouter = router({});

export type AppRouter = typeof appRouter;
