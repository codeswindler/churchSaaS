import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MobileDevicesService } from './mobile-devices.service';
import { MobileFundsGuard } from './mobile-funds.guard';

@Controller('mobile/devices')
@UseGuards(MobileFundsGuard)
export class MobileDevicesController {
  constructor(private readonly mobileDevicesService: MobileDevicesService) {}

  @Post()
  registerDevice(@Request() req: any, @Body() body: any) {
    return this.mobileDevicesService.registerDevice(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Delete(':deviceId')
  deactivateDevice(@Request() req: any, @Param('deviceId') deviceId: string) {
    return this.mobileDevicesService.deactivateDevice(
      req.user.churchId,
      req.user.id,
      deviceId,
    );
  }
}
