import { Injectable } from '@nestjs/common';
import type { SupabaseTokenUser } from 'src/auth/supabase-jwt.strategy';

@Injectable()
export class AppService {
  async getHello(user: SupabaseTokenUser): Promise<string> {
    return `Hello ${user.sub} (${user.email} @ session ${user.session_id})!`;
  }
}
