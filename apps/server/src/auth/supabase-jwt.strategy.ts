import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { config } from '../config';
import { z } from 'zod';

const supabaseTokenUserSchema = z.object({
  sub: z.string(),
  aud: z.string(),
  iat: z.number(),
  exp: z.number(),
  iss: z.string(),

  email: z.string(),
  phone: z.string(),
  app_metadata: z.record(z.any()),
  user_metadata: z.record(z.any()),
  role: z.string(),
  aal: z.string().optional(),
  amr: z
    .array(
      z.object({
        method: z.string(),
        timestamp: z.number(),
        provider: z.string().optional(),
      }),
    )
    .optional(),
  session_id: z.string().optional(),
  is_anonymous: z.boolean(),
});

export type SupabaseTokenUser = z.infer<typeof supabaseTokenUserSchema>;

@Injectable()
export class SupabaseJWTStrategy extends PassportStrategy(
  Strategy,
  'supabase-jwt',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.SUPABASE_JWT_SECRET,
      algorithms: ['HS256'],
      audience: 'authenticated',
    });
  }

  async validate(payload: unknown) {
    return supabaseTokenUserSchema.parse(payload);
  }
}
