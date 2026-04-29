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
import { ChurchPermission } from '../common/access-control';
import { ChurchAccessGuard } from '../auth/church-access.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ContributionsService } from '../contributions/contributions.service';
import { ChurchUserRole } from '../entities/church-user.entity';
import { ChurchService } from './church.service';

@Controller('church')
@UseGuards(JwtAuthGuard, ChurchAccessGuard, RolesGuard, PermissionsGuard)
export class ChurchController {
  constructor(
    private readonly churchService: ChurchService,
    private readonly contributionsService: ContributionsService,
  ) {}

  @Get('dashboard')
  @Permissions(ChurchPermission.DASHBOARD_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  getDashboard(@Request() req: any, @Query() query: any) {
    return this.churchService.getDashboard(req.user.churchId, query);
  }

  @Get('subscription/status')
  @Permissions(ChurchPermission.DASHBOARD_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  getSubscriptionStatus(@Request() req: any) {
    return this.churchService.getSubscriptionStatus(req.user.churchId);
  }

  @Get('fund-accounts')
  @Permissions(ChurchPermission.FUND_ACCOUNTS_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  listFundAccounts(@Request() req: any) {
    return this.churchService.listFundAccounts(req.user.churchId);
  }

  @Post('fund-accounts')
  @Permissions(ChurchPermission.FUND_ACCOUNTS_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  createFundAccount(@Request() req: any, @Body() body: any) {
    return this.churchService.createFundAccount(req.user.churchId, body);
  }

  @Patch('fund-accounts/:fundAccountId')
  @Permissions(ChurchPermission.FUND_ACCOUNTS_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
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
  @Permissions(ChurchPermission.USERS_VIEW)
  @Roles(ChurchUserRole.PRIEST)
  listUsers(@Request() req: any) {
    return this.churchService.listChurchUsers(req.user.churchId);
  }

  @Post('users')
  @Permissions(ChurchPermission.USERS_MANAGE)
  @Roles(ChurchUserRole.PRIEST)
  createUser(@Request() req: any, @Body() body: any) {
    return this.churchService.createChurchUser(req.user.churchId, body);
  }

  @Patch('users/:userId')
  @Permissions(ChurchPermission.USERS_MANAGE)
  @Roles(ChurchUserRole.PRIEST)
  updateUser(
    @Request() req: any,
    @Param('userId') userId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateChurchUser(req.user.churchId, userId, body);
  }

  @Get('contributions')
  @Permissions(ChurchPermission.CONTRIBUTIONS_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  listContributions(@Request() req: any, @Query() query: any) {
    return this.churchService.listContributions(req.user.churchId, query);
  }

  @Get('contributors')
  @Permissions(ChurchPermission.CONTRIBUTORS_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  listContributors(@Request() req: any, @Query() query: any) {
    return this.churchService.listContributors(req.user.churchId, query);
  }

  @Patch('contributors/:contributorId')
  @Permissions(ChurchPermission.CONTRIBUTORS_TAG)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  updateContributor(
    @Request() req: any,
    @Param('contributorId') contributorId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateContributor(
      req.user.churchId,
      contributorId,
      body,
    );
  }

  @Post('contributions/manual')
  @Permissions(ChurchPermission.CONTRIBUTIONS_RECORD)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.TREASURER)
  createManualContribution(@Request() req: any, @Body() body: any) {
    return this.churchService.createManualContribution(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Get('reports/summary')
  @Permissions(ChurchPermission.REPORTS_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  getReportsSummary(@Request() req: any, @Query() query: any) {
    return this.churchService.getReportSummary(req.user.churchId, query);
  }

  @Post('messaging/bulk')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  sendBulkMessage(@Request() req: any, @Body() body: any) {
    return this.churchService.sendBulkMessage(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Get('messaging/config')
  @Permissions(ChurchPermission.MESSAGING_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  getMessagingConfig(@Request() req: any) {
    return this.churchService.getMessagingConfig(req.user.churchId);
  }

  @Get('messaging/outbox')
  @Permissions(ChurchPermission.OUTBOX_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  listSmsOutbox(@Request() req: any, @Query() query: any) {
    return this.churchService.listSmsOutbox(req.user.churchId, query);
  }

  @Get('messaging/outbox/export')
  @Permissions(ChurchPermission.OUTBOX_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  async exportSmsOutbox(
    @Request() req: any,
    @Query() query: any,
    @Res() response: Response,
  ) {
    const csv = await this.churchService.exportSmsOutboxCsv(
      req.user.churchId,
      query,
    );
    response.setHeader('Content-Type', 'text/csv');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="sms-outbox.csv"',
    );
    response.send(csv);
  }

  @Get('messaging/usage')
  @Permissions(ChurchPermission.OUTBOX_VIEW)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
  )
  getSmsUsage(@Request() req: any, @Query() query: any) {
    return this.churchService.getSmsUsage(req.user.churchId, query);
  }

  @Get('messaging/address-books')
  @Permissions(ChurchPermission.MESSAGING_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  listAddressBooks(@Request() req: any) {
    return this.churchService.listAddressBooks(req.user.churchId);
  }

  @Post('messaging/address-books')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  createAddressBook(@Request() req: any, @Body() body: any) {
    return this.churchService.createAddressBook(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Patch('messaging/address-books/:addressBookId')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  updateAddressBook(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateAddressBook(
      req.user.churchId,
      addressBookId,
      body,
    );
  }

  @Get('messaging/address-books/:addressBookId/contacts')
  @Permissions(ChurchPermission.MESSAGING_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  listAddressBookContacts(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
  ) {
    return this.churchService.listAddressBookContacts(
      req.user.churchId,
      addressBookId,
    );
  }

  @Post('messaging/address-books/:addressBookId/contacts/import')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.SECRETARY)
  importAddressBookContacts(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
    @Body() body: any,
  ) {
    return this.churchService.importAddressBookContacts(
      req.user.churchId,
      addressBookId,
      body,
    );
  }

  @Get('reports/export')
  @Permissions(ChurchPermission.REPORTS_EXPORT)
  @Roles(
    ChurchUserRole.PRIEST,
    ChurchUserRole.TREASURER,
    ChurchUserRole.SECRETARY,
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
