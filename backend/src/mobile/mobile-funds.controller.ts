import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { MobileFundsGuard } from './mobile-funds.guard';
import { MobileFundAccountsResponseDto } from './mobile-funds.dto';
import { MobileFundsService } from './mobile-funds.service';

@Controller('mobile/funds')
@UseGuards(MobileFundsGuard)
export class MobileFundsController {
  constructor(private readonly mobileFundsService: MobileFundsService) {}

  @Get('dashboard')
  getDashboard(@Request() req: any, @Query() query: any) {
    return this.mobileFundsService.getDashboard(req.user.churchId, query);
  }

  @Get('summary')
  getSummary(@Request() req: any, @Query() query: any) {
    return this.mobileFundsService.getSummary(req.user.churchId, query);
  }

  @Get('transactions')
  listTransactions(@Request() req: any, @Query() query: any) {
    return this.mobileFundsService.listTransactions(req.user.churchId, query);
  }

  @Get('fund-accounts')
  listFundAccounts(
    @Request() req: any,
  ): Promise<MobileFundAccountsResponseDto> {
    return this.mobileFundsService.listFundAccounts(req.user.churchId);
  }
}
