import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SupabaseTokenUser } from 'src/auth/supabase-jwt.strategy';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): SupabaseTokenUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
