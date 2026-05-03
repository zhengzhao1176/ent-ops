import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  LoginInput,
  ChangePasswordInput,
  RefreshInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@/contracts/user/auth.contract';
import { authService } from '../services/auth.service';
import { TRPCError } from '@trpc/server';

export const authRouter = router({
  login: publicProcedure.input(LoginInput).mutation(({ ctx, input }) => authService.login(ctx, input)),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    void ctx;
    return { ok: true as const };
  }),

  refresh: publicProcedure.input(RefreshInput).mutation(async () => {
    throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'TODO refresh token' });
  }),

  changePassword: protectedProcedure
    .input(ChangePasswordInput)
    .mutation(({ ctx, input }) => authService.changePassword(ctx, ctx.user!.id, input)),

  forgotPassword: publicProcedure.input(ForgotPasswordInput).mutation(async () => {
    throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'TODO forgot password' });
  }),

  resetPassword: publicProcedure.input(ResetPasswordInput).mutation(async () => {
    throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'TODO reset password' });
  }),

  me: protectedProcedure.query(({ ctx }) => authService.me(ctx)),
});
