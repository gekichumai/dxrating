import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { config } from '../config';

@Injectable()
export class AuthService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
  }

  async getUser(token: string): Promise<User> {
    try {
      const {
        data: { user },
        error,
      } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException(error?.message);
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }
}
