import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('platform/setup')
  setupPlatformAdmin(@Body() body: any) {
    return this.authService.createInitialPlatformAdmin(
      body.email,
      body.password,
      body.name,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: any) {
    const identifier =
      body.identifier || body.email || body.username || body.phone;
    return this.authService.login(identifier, body.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('platform/login')
  platformLogin(@Body() body: any) {
    const identifier = body.identifier || body.email || body.username;
    return this.authService.platformLogin(identifier, body.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('church/login')
  churchLogin(@Body() body: any) {
    const identifier =
      body.identifier || body.email || body.username || body.phone;
    return this.authService.churchLogin(identifier, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req: any, @Body() body: any) {
    return this.authService.updateProfile(req.user, body);
  }
}
