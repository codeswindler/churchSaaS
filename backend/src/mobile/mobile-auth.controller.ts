import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Controller('mobile/auth')
export class MobileAuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: any) {
    const identifier =
      body.identifier || body.email || body.username || body.phone;
    return this.authService.mobileFundsLogin(identifier, body.password);
  }
}
