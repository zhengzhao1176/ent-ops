import { router } from '../trpc';
import { authRouter } from './auth.router';
import { userRouter } from './user.router';
import { roleRouter } from './role.router';
import { departmentRouter } from './department.router';
import { permissionRouter } from './permission.router';
import { auditRouter } from './audit.router';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  role: roleRouter,
  department: departmentRouter,
  permission: permissionRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
