import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformUserRole } from '../entities/platform-user.entity';
import { SmsService } from './sms.service';

@Controller('sms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Get('balance')
  @Roles(PlatformUserRole.PLATFORM_ADMIN)
  async getBalance() {
    return { balance: await this.smsService.getBalance() };
  }
}
