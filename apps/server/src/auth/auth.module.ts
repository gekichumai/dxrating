import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { SupabaseJWTStrategy } from './supabase-jwt.strategy';

@Module({
  imports: [PassportModule],
  providers: [AuthService, SupabaseJWTStrategy],
  exports: [AuthService, SupabaseJWTStrategy],
})
export class AuthModule {}
