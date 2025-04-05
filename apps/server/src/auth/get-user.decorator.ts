import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): SupabaseTokenUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
