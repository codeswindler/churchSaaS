import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformUserRole } from '../entities/platform-user.entity';
import { PlatformService } from './platform.service';

@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PlatformUserRole.PLATFORM_ADMIN)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('dashboard/summary')
  getDashboardSummary() {
    return this.platformService.getDashboardSummary();
  }

  @Get('churches')
  listChurches() {
    return this.platformService.listChurches();
  }

  @Get('churches/:churchId')
  getChurchDetails(@Param('churchId') churchId: string) {
    return this.platformService.getChurchDetails(churchId);
  }

  @Post('churches')
  createChurch(@Body() body: any, @Request() req: any) {
    return this.platformService.createChurch(body, req.user.id);
  }

  @Patch('churches/:churchId')
  updateChurch(@Param('churchId') churchId: string, @Body() body: any) {
    return this.platformService.updateChurch(churchId, body);
  }

  @Get('users')
  listPlatformUsers() {
    return this.platformService.listPlatformUsers();
  }

  @Post('users')
  createPlatformUser(@Body() body: any) {
    return this.platformService.createPlatformUser(body);
  }

  @Get('churches/:churchId/subscription/history')
  getChurchSubscriptionHistory(@Param('churchId') churchId: string) {
    return this.platformService.getChurchSubscriptionHistory(churchId);
  }

  @Post('churches/:churchId/subscription/add-days')
  addChurchSubscriptionDays(
    @Param('churchId') churchId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.platformService.addSubscriptionDays(
      churchId,
      Number(body.days),
      req.user.id,
      body.reason,
    );
  }

  @Post('churches/:churchId/subscription/subtract-days')
  subtractChurchSubscriptionDays(
    @Param('churchId') churchId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.platformService.subtractSubscriptionDays(
      churchId,
      Number(body.days),
      req.user.id,
      body.reason,
    );
  }

  @Post('churches/:churchId/subscription/suspend')
  suspendChurchSubscription(
    @Param('churchId') churchId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.platformService.suspendChurchSubscription(
      churchId,
      req.user.id,
      body.reason,
    );
  }

  @Post('churches/:churchId/subscription/reactivate')
  reactivateChurchSubscription(
    @Param('churchId') churchId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.platformService.reactivateChurchSubscription(
      churchId,
      Number(body.days || 30),
      req.user.id,
      body.reason,
    );
  }
}
