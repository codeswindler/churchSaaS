import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { MobileB2cGuard } from './mobile-b2c.guard';
import { MobileB2cService } from './mobile-b2c.service';

interface MobileB2cRequest {
  user: {
    id: string;
    churchId: string;
  };
}

@Controller('mobile/b2c')
export class MobileB2cController {
  constructor(private readonly mobileB2cService: MobileB2cService) {}

  @Get('withdrawals')
  @UseGuards(MobileB2cGuard)
  listWithdrawals(
    @Request() req: MobileB2cRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.mobileB2cService.listWithdrawals(req.user.churchId, query);
  }

  @Post('withdrawals')
  @UseGuards(MobileB2cGuard)
  createWithdrawal(@Request() req: MobileB2cRequest, @Body() body: any) {
    return this.mobileB2cService.createWithdrawal(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Post('withdrawals/callback/result')
  handleResultCallback(@Body() body: any) {
    return this.mobileB2cService.handleResultCallback(body);
  }

  @Post('withdrawals/callback/timeout')
  handleTimeoutCallback(@Body() body: any) {
    return this.mobileB2cService.handleTimeoutCallback(body);
  }
}
