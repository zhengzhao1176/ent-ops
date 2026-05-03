import { router, protectedProcedure } from '../trpc';
import {
  UserCreateInput,
  UserUpdateInput,
  UserListInput,
  AssignRolesInput,
  ResetPasswordByAdminInput,
  StatusActionInput,
} from '@/contracts/user/user.contract';
import { IdParam, OkResp } from '@/contracts/_shared';
import { userService } from '../services/user.service';

export const userRouter = router({
  list: protectedProcedure.input(UserListInput).query(({ ctx, input }) =>
    userService.list(ctx, {
      page: input.page,
      pageSize: input.pageSize,
      keyword: input.keyword,
      status: input.status,
      deptId: input.deptId,
    }),
  ),

  detail: protectedProcedure.input(IdParam).query(({ ctx, input }) => userService.detail(ctx, input.id)),

  create: protectedProcedure.input(UserCreateInput).mutation(({ ctx, input }) => userService.create(ctx, input)),

  update: protectedProcedure.input(UserUpdateInput).mutation(({ ctx, input }) => userService.update(ctx, input)),

  delete: protectedProcedure
    .input(IdParam)
    .output(OkResp)
    .mutation(({ ctx, input }) => userService.softDelete(ctx, input.id)),

  restore: protectedProcedure.input(IdParam).mutation(({ ctx, input }) => userService.restore(ctx, input.id)),

  activate: protectedProcedure
    .input(StatusActionInput)
    .mutation(({ ctx, input }) => userService.setStatus(ctx, input.id, 'ACTIVE')),

  deactivate: protectedProcedure
    .input(StatusActionInput)
    .mutation(({ ctx, input }) => userService.setStatus(ctx, input.id, 'DISABLED')),

  lock: protectedProcedure
    .input(StatusActionInput)
    .mutation(({ ctx, input }) => userService.setStatus(ctx, input.id, 'LOCKED')),

  unlock: protectedProcedure
    .input(StatusActionInput)
    .mutation(({ ctx, input }) => userService.setStatus(ctx, input.id, 'ACTIVE')),

  resetPassword: protectedProcedure
    .input(ResetPasswordByAdminInput)
    .mutation(({ ctx, input }) => userService.resetPasswordByAdmin(ctx, input.userId)),

  assignRoles: protectedProcedure
    .input(AssignRolesInput)
    .mutation(({ ctx, input }) => userService.assignRoles(ctx, input.userId, input.roleIds)),
});
