import {
  Body,
  Controller,
  Param,
  Get,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChurchAccessGuard } from '../auth/church-access.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ContributionsService } from '../contributions/contributions.service';
import { ChurchUserRole } from '../entities/church-user.entity';
import { ChurchService } from './church.service';

@Controller('church')
@UseGuards(JwtAuthGuard, ChurchAccessGuard, RolesGuard)
export class ChurchController {
  constructor(
    private readonly churchService: ChurchService,
    private readonly contributionsService: ContributionsService,
  ) {}

  @Get('dashboard')
  @Roles(
    ChurchUserRole.CHURCH_ADMIN,
    ChurchUserRole.PRIEST,
    ChurchUserRole.CASHIER,
  )
  getDashboard(@Request() req: any, @Query() query: any) {
    return this.churchService.getDashboard(req.user.churchId, query);
  }

  @Get('subscription/status')
  @Roles(
    ChurchUserRole.CHURCH_ADMIN,
    ChurchUserRole.PRIEST,
    ChurchUserRole.CASHIER,
  )
  getSubscriptionStatus(@Request() req: any) {
    return this.churchService.getSubscriptionStatus(req.user.churchId);
  }

  @Get('fund-accounts')
  @Roles(
    ChurchUserRole.CHURCH_ADMIN,
    ChurchUserRole.PRIEST,
    ChurchUserRole.CASHIER,
  )
  listFundAccounts(@Request() req: any) {
    return this.churchService.listFundAccounts(req.user.churchId);
  }

  @Post('fund-accounts')
  @Roles(ChurchUserRole.CHURCH_ADMIN)
  createFundAccount(@Request() req: any, @Body() body: any) {
    return this.churchService.createFundAccount(req.user.churchId, body);
  }

  @Patch('fund-accounts/:fundAccountId')
  @Roles(ChurchUserRole.CHURCH_ADMIN)
  updateFundAccount(
    @Request() req: any,
    @Param('fundAccountId') fundAccountId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateFundAccount(
      req.user.churchId,
      fundAccountId,
      body,
    );
  }

  @Get('users')
  @Roles(ChurchUserRole.CHURCH_ADMIN)
  listUsers(@Request() req: any) {
    return this.churchService.listChurchUsers(req.user.churchId);
  }

  @Post('users')
  @Roles(ChurchUserRole.CHURCH_ADMIN)
  createUser(@Request() req: any, @Body() body: any) {
    return this.churchService.createChurchUser(req.user.churchId, body);
  }

  @Patch('users/:userId')
  @Roles(ChurchUserRole.CHURCH_ADMIN)
  updateUser(
    @Request() req: any,
    @Param('userId') userId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateChurchUser(req.user.churchId, userId, body);
  }

  @Get('contributions')
  @Roles(
    ChurchUserRole.CHURCH_ADMIN,
    ChurchUserRole.PRIEST,
    ChurchUserRole.CASHIER,
  )
  listContributions(@Request() req: any, @Query() query: any) {
    return this.churchService.listContributions(req.user.churchId, query);
  }

  @Post('contributions/manual')
  @Roles(ChurchUserRole.CHURCH_ADMIN, ChurchUserRole.CASHIER)
  createManualContribution(@Request() req: any, @Body() body: any) {
    return this.churchService.createManualContribution(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Get('reports/summary')
  @Roles(
    ChurchUserRole.CHURCH_ADMIN,
    ChurchUserRole.PRIEST,
    ChurchUserRole.CASHIER,
  )
  getReportsSummary(@Request() req: any, @Query() query: any) {
    return this.churchService.getReportSummary(req.user.churchId, query);
  }

  @Get('reports/export')
  @Roles(
    ChurchUserRole.CHURCH_ADMIN,
    ChurchUserRole.PRIEST,
    ChurchUserRole.CASHIER,
  )
  async exportReport(
    @Request() req: any,
    @Query() query: any,
    @Res() response: Response,
  ) {
    const format = (query.format || 'csv') as 'csv' | 'pdf';
    return this.contributionsService.sendExportResponse(
      response,
      req.user.churchId,
      query,
      format,
    );
  }
}
