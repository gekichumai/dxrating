import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppService } from './app.service';
import { SupabaseTokenUser } from 'src/auth/supabase-jwt.strategy';
import { GetUser } from 'src/auth/get-user.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @UseGuards(AuthGuard('supabase-jwt'))
  async getHello(@GetUser() user: SupabaseTokenUser): Promise<string> {
    return this.appService.getHello(user);
  }
}
