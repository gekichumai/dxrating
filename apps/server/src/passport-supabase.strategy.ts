import type { Request } from 'express';
import type { JwtFromRequestFunction } from 'passport-jwt';
import { Strategy } from 'passport-strategy';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseAuthUser } from './user.type';

export class SupabaseAuthStrategy extends Strategy {
  readonly name = 'supabase';
  private readonly supabase: SupabaseClient;
  private readonly extractor: JwtFromRequestFunction;

  constructor() {
    super();
    if (!options.extractor) {
      throw new Error(
        '\n Extractor is not a function. You should provide an extractor. \n Read the docs: https://github.com/tfarras/nestjs-firebase-auth#readme',
      );
    }

    this.supabase = createClient(
      options.supabaseUrl,
      options.supabaseKey,
      options.supabaseOptions,
    );
    this.extractor = options.extractor;
  }

  async validate(payload: SupabaseAuthUser): Promise<SupabaseAuthUser | null> {
    if (payload) {
      this.success(payload, {});

      return payload;
    }

    this.fail(401);

    return null;
  }

  authenticate(req: Request): void {
    const idToken = this.extractor(req);

    if (!idToken) {
      this.fail(401);
      return;
    }

    this.supabase.auth
      .getUser(idToken)
      .then(({ data: { user } }) => this.validate(user))
      .catch((err) => {
        this.fail(err.message, 401);
      });
  }
}
