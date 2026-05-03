import { router } from '../trpc';
import { authRouter } from './auth.router';
import { userRouter } from './user.router';
import { roleRouter } from './role.router';
import { departmentRouter } from './department.router';
import { permissionRouter } from './permission.router';
import { auditRouter } from './audit.router';
import { categoryRouter } from './category.router';
import { unitRouter } from './unit.router';
import { goodsRouter } from './goods.router';
import { warehouseRouter } from './warehouse.router';
import { locationRouter } from './location.router';
import { stockRouter } from './stock.router';
import { stockLogRouter } from './stockLog.router';
import { inboundRouter } from './inbound.router';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  role: roleRouter,
  department: departmentRouter,
  permission: permissionRouter,
  audit: auditRouter,
  category: categoryRouter,
  unit: unitRouter,
  goods: goodsRouter,
  warehouse: warehouseRouter,
  location: locationRouter,
  stock: stockRouter,
  stockLog: stockLogRouter,
  inbound: inboundRouter,
});

export type AppRouter = typeof appRouter;
