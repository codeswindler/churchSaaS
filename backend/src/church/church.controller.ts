import {
  Body,
  Controller,
  Delete,
  Param,
  Get,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getDashboard(@Request() req: any, @Query() query: any) {
    return this.churchService.getDashboard(req.user.churchId, query);
  }

  @Get('subscription/status')
  @Permissions(ChurchPermission.DASHBOARD_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getSubscriptionStatus(@Request() req: any) {
    return this.churchService.getSubscriptionStatus(req.user.churchId);
  }

  @Get('discipleship/summary')
  @Permissions(ChurchPermission.DISCIPLESHIP_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getDiscipleshipSummary(@Request() req: any) {
    return this.churchService.getDiscipleshipSummary(req.user.churchId);
  }

  @Get('discipleship/members')
  @Permissions(ChurchPermission.DISCIPLESHIP_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listDiscipleshipMembers(@Request() req: any, @Query() query: any) {
    return this.churchService.listDiscipleshipMembers(
      req.user.churchId,
      query,
    );
  }

  @Post('discipleship/members')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createDiscipleshipMember(@Request() req: any, @Body() body: any) {
    return this.churchService.createDiscipleshipMember(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Get('discipleship/members/import-template')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  async downloadDiscipleshipMemberTemplate(@Res() response: Response) {
    const workbook =
      await this.churchService.generateDiscipleshipMemberImportTemplate();
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="discipleship-member-template.xlsx"',
    );
    response.send(workbook);
  }

  @Post('discipleship/members/import')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  importDiscipleshipMembers(
    @Request() req: any,
    @UploadedFile() file: any,
  ) {
    return this.churchService.importDiscipleshipMembers(
      req.user.churchId,
      req.user.id,
      file,
    );
  }

  @Get('discipleship/matches')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listDiscipleshipMatches(@Request() req: any) {
    return this.churchService.listDiscipleshipMatchCandidates(
      req.user.churchId,
    );
  }

  @Get('discipleship/duplicate-members')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listDiscipleshipDuplicateMembers(@Request() req: any) {
    return this.churchService.listDiscipleshipDuplicateMemberClusters(
      req.user.churchId,
    );
  }

  @Post('discipleship/duplicate-members/review')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  reviewDiscipleshipDuplicateMembers(
    @Request() req: any,
    @Body() body: any,
  ) {
    return this.churchService.reviewDiscipleshipDuplicateMembers(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Post('discipleship/matches/:candidateId/review')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  reviewDiscipleshipMatch(
    @Request() req: any,
    @Param('candidateId') candidateId: string,
    @Body() body: any,
  ) {
    return this.churchService.reviewDiscipleshipMatchCandidate(
      req.user.churchId,
      req.user.id,
      candidateId,
      body.action,
    );
  }

  @Post('discipleship/reconciliation/mpesa-statement')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importMpesaStatement(
    @Request() req: any,
    @UploadedFile() file: any,
  ) {
    return this.churchService.importMpesaStatementForDiscipleship(
      req.user.churchId,
      file,
    );
  }

  @Get('discipleship/members/:memberId')
  @Permissions(ChurchPermission.DISCIPLESHIP_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getDiscipleshipMember(
    @Request() req: any,
    @Param('memberId') memberId: string,
  ) {
    return this.churchService.getDiscipleshipMember(
      req.user.churchId,
      memberId,
    );
  }

  @Patch('discipleship/members/:memberId')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  updateDiscipleshipMember(
    @Request() req: any,
    @Param('memberId') memberId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateDiscipleshipMember(
      req.user.churchId,
      memberId,
      body,
    );
  }

  @Get('discipleship/groups')
  @Permissions(ChurchPermission.DISCIPLESHIP_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listDiscipleshipGroups(@Request() req: any) {
    return this.churchService.listDiscipleshipGroups(req.user.churchId);
  }

  @Post('discipleship/groups')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createDiscipleshipGroup(@Request() req: any, @Body() body: any) {
    return this.churchService.createDiscipleshipGroup(
      req.user.churchId,
      body,
    );
  }

  @Patch('discipleship/groups/:groupId')
  @Permissions(ChurchPermission.DISCIPLESHIP_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  updateDiscipleshipGroup(
    @Request() req: any,
    @Param('groupId') groupId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateDiscipleshipGroup(
      req.user.churchId,
      groupId,
      body,
    );
  }

  @Get('discipleship/attendance')
  @Permissions(ChurchPermission.DISCIPLESHIP_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listDiscipleshipAttendance(@Request() req: any, @Query() query: any) {
    return this.churchService.listDiscipleshipAttendance(
      req.user.churchId,
      query,
    );
  }

  @Post('discipleship/attendance/mark')
  @Permissions(ChurchPermission.DISCIPLESHIP_ATTENDANCE_RECORD)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  markDiscipleshipAttendance(@Request() req: any, @Body() body: any) {
    return this.churchService.markDiscipleshipAttendance(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Get('congregation-page')
  @Permissions(ChurchPermission.CONGREGATION_PAGE_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getCongregationPage(@Request() req: any) {
    return this.churchService.getCongregationPage(req.user.churchId);
  }

  @Get('notifications')
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listNotifications(@Request() req: any, @Query() query: any) {
    return this.churchService.listChurchNotifications(
      req.user.churchId,
      req.user.id,
      query,
    );
  }

  @Patch('congregation-page')
  @Permissions(ChurchPermission.CONGREGATION_PAGE_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  updateCongregationPage(@Request() req: any, @Body() body: any) {
    return this.churchService.updateCongregationPage(
      req.user.churchId,
      req.user.id,
      req.user.role,
      body,
    );
  }

  @Get('congregation-page/fund-displays')
  @Permissions(ChurchPermission.CONGREGATION_PAGE_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listFundDisplays(@Request() req: any) {
    return this.churchService.listCongregationFundDisplays(req.user.churchId);
  }

  @Post('congregation-page/fund-displays')
  @Permissions(ChurchPermission.CONGREGATION_PAGE_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createFundDisplay(@Request() req: any, @Body() body: any) {
    return this.churchService.createCongregationFundDisplay(
      req.user.churchId,
      req.user.id,
      req.user.role,
      body,
    );
  }

  @Patch('congregation-page/fund-displays/:displayId')
  @Permissions(ChurchPermission.CONGREGATION_PAGE_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  updateFundDisplay(
    @Request() req: any,
    @Param('displayId') displayId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateCongregationFundDisplay(
      req.user.churchId,
      req.user.id,
      req.user.role,
      displayId,
      body,
    );
  }

  @Delete('congregation-page/fund-displays/:displayId')
  @Permissions(ChurchPermission.CONGREGATION_PAGE_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  deleteFundDisplay(
    @Request() req: any,
    @Param('displayId') displayId: string,
  ) {
    return this.churchService.deleteCongregationFundDisplay(
      req.user.churchId,
      req.user.id,
      displayId,
    );
  }

  @Post('congregation-page/images')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Permissions(ChurchPermission.CONGREGATION_PAGE_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  uploadCongregationImage(
    @Request() req: any,
    @UploadedFile() image: any,
  ) {
    return this.churchService.uploadCongregationImage(req.user.churchId, image);
  }

  @Post('presentation/media')
  @UseInterceptors(
    FileInterceptor('media', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Permissions(ChurchPermission.PRESENTATION_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  uploadPresentationMedia(
    @Request() req: any,
    @UploadedFile() media: any,
  ) {
    return this.churchService.uploadPresentationMedia(req.user.churchId, media);
  }

  @Get('fund-accounts')
  @Permissions(ChurchPermission.FUND_ACCOUNTS_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listFundAccounts(@Request() req: any) {
    return this.churchService.listFundAccounts(req.user.churchId);
  }

  @Post('fund-accounts')
  @Permissions(ChurchPermission.FUND_ACCOUNTS_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createFundAccount(@Request() req: any, @Body() body: any) {
    return this.churchService.createFundAccount(req.user.churchId, body);
  }

  @Patch('fund-accounts/:fundAccountId')
  @Permissions(ChurchPermission.FUND_ACCOUNTS_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
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
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listUsers(@Request() req: any) {
    return this.churchService.listChurchUsers(req.user.churchId);
  }

  @Post('users')
  @Permissions(ChurchPermission.USERS_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createUser(@Request() req: any, @Body() body: any) {
    return this.churchService.createChurchUser(req.user.churchId, body);
  }

  @Patch('users/:userId')
  @Permissions(ChurchPermission.USERS_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  updateUser(
    @Request() req: any,
    @Param('userId') userId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateChurchUser(req.user.churchId, userId, body);
  }

  @Post('users/:userId/resend-credentials')
  @Permissions(ChurchPermission.USERS_MANAGE)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  resendUserCredentials(
    @Request() req: any,
    @Param('userId') userId: string,
  ) {
    return this.churchService.resendChurchUserCredentials(
      req.user.churchId,
      userId,
    );
  }

  @Get('contributions')
  @Permissions(ChurchPermission.CONTRIBUTIONS_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listContributions(@Request() req: any, @Query() query: any) {
    return this.churchService.listContributions(req.user.churchId, query);
  }

  @Get('contributors')
  @Permissions(ChurchPermission.CONTRIBUTORS_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listContributors(@Request() req: any, @Query() query: any) {
    return this.churchService.listContributors(req.user.churchId, query);
  }

  @Patch('contributors/:contributorId')
  @Permissions(ChurchPermission.CONTRIBUTORS_TAG)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
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
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createManualContribution(@Request() req: any, @Body() body: any) {
    return this.churchService.createManualContribution(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Get('reports/summary')
  @Permissions(ChurchPermission.REPORTS_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getReportsSummary(@Request() req: any, @Query() query: any) {
    return this.churchService.getReportSummary(req.user.churchId, query);
  }

  @Post('messaging/bulk')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  sendBulkMessage(@Request() req: any, @Body() body: any) {
    return this.churchService.sendBulkMessage(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Post('messaging/bulk/quote')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  quoteBulkMessage(@Request() req: any, @Body() body: any) {
    return this.churchService.quoteBulkMessage(req.user.churchId, body);
  }

  @Post('messaging/bulk/purchase')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createBulkMessagePurchase(@Request() req: any, @Body() body: any) {
    return this.churchService.createBulkMessagePurchase(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Post('congregation-page/fund-displays/:displayId/approve')
  @Roles(ChurchUserRole.PRIEST)
  approveFundDisplay(
    @Request() req: any,
    @Param('displayId') displayId: string,
    @Body() body: any,
  ) {
    return this.churchService.reviewCongregationFundDisplay(
      req.user.churchId,
      req.user.id,
      displayId,
      'approve',
      {
        note: body?.note,
        durationMinutes: body?.durationMinutes,
      },
    );
  }

  @Post('congregation-page/fund-displays/:displayId/duration')
  @Roles(ChurchUserRole.PRIEST)
  updateFundDisplayDuration(
    @Request() req: any,
    @Param('displayId') displayId: string,
    @Body() body: any,
  ) {
    return this.churchService.updateCongregationFundDisplayDuration(
      req.user.churchId,
      req.user.id,
      displayId,
      body,
    );
  }

  @Post('congregation-page/fund-displays/:displayId/reject')
  @Roles(ChurchUserRole.PRIEST)
  rejectFundDisplay(
    @Request() req: any,
    @Param('displayId') displayId: string,
    @Body() body: any,
  ) {
    return this.churchService.reviewCongregationFundDisplay(
      req.user.churchId,
      req.user.id,
      displayId,
      'reject',
      { note: body?.note },
    );
  }

  @Patch('notifications/:notificationId/read')
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  markNotificationRead(
    @Request() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    return this.churchService.markChurchNotificationRead(
      req.user.churchId,
      req.user.id,
      notificationId,
    );
  }

  @Get('messaging/bulk/purchases/:purchaseId')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getBulkMessagePurchase(
    @Request() req: any,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.churchService.getBulkMessagePurchase(
      req.user.churchId,
      purchaseId,
    );
  }

  @Post('messaging/bulk/purchases/:purchaseId/send')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  sendBulkMessagePurchase(
    @Request() req: any,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.churchService.sendBulkMessagePurchase(
      req.user.churchId,
      req.user.id,
      purchaseId,
    );
  }

  @Get('messaging/config')
  @Permissions(ChurchPermission.MESSAGING_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getMessagingConfig(@Request() req: any) {
    return this.churchService.getMessagingConfig(req.user.churchId);
  }

  @Get('messaging/outbox')
  @Permissions(ChurchPermission.OUTBOX_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listSmsOutbox(@Request() req: any, @Query() query: any) {
    return this.churchService.listSmsOutbox(req.user.churchId, query);
  }

  @Post('messaging/outbox/delivery-refresh')
  @Permissions(ChurchPermission.OUTBOX_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  refreshSmsDeliveryReports(@Request() req: any, @Body() body: any) {
    return this.churchService.refreshSmsDeliveryReports(req.user.churchId, body);
  }

  @Post('messaging/outbox/:messageId/dlr')
  @Permissions(ChurchPermission.OUTBOX_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  fetchSmsDeliveryReport(
    @Request() req: any,
    @Param('messageId') messageId: string,
  ) {
    return this.churchService.fetchSmsDeliveryReport(
      req.user.churchId,
      messageId,
    );
  }

  @Get('messaging/outbox/export')
  @Permissions(ChurchPermission.OUTBOX_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
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
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  getSmsUsage(@Request() req: any, @Query() query: any) {
    return this.churchService.getSmsUsage(req.user.churchId, query);
  }

  @Get('messaging/address-books')
  @Permissions(ChurchPermission.MESSAGING_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listAddressBooks(@Request() req: any) {
    return this.churchService.listAddressBooks(req.user.churchId);
  }

  @Post('messaging/address-books')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  createAddressBook(@Request() req: any, @Body() body: any) {
    return this.churchService.createAddressBook(
      req.user.churchId,
      req.user.id,
      body,
    );
  }

  @Patch('messaging/address-books/:addressBookId')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
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

  @Delete('messaging/address-books/:addressBookId')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  deleteAddressBook(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
  ) {
    return this.churchService.deleteAddressBook(req.user.churchId, addressBookId);
  }

  @Get('messaging/address-books/:addressBookId/contacts')
  @Permissions(ChurchPermission.MESSAGING_VIEW)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  listAddressBookContacts(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
  ) {
    return this.churchService.listAddressBookContacts(
      req.user.churchId,
      addressBookId,
    );
  }

  @Post('messaging/address-books/:addressBookId/contacts')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  addAddressBookContact(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
    @Body() body: any,
  ) {
    return this.churchService.addAddressBookContact(
      req.user.churchId,
      addressBookId,
      body,
    );
  }

  @Post('messaging/address-books/:addressBookId/contacts/import-file')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  importAddressBookContactsFile(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
    @UploadedFile() file: any,
  ) {
    return this.churchService.importAddressBookContactsFile(
      req.user.churchId,
      addressBookId,
      file,
    );
  }

  @Delete('messaging/address-books/:addressBookId/contacts/:contactId')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
  deleteAddressBookContact(
    @Request() req: any,
    @Param('addressBookId') addressBookId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.churchService.deleteAddressBookContact(
      req.user.churchId,
      addressBookId,
      contactId,
    );
  }

  @Post('messaging/address-books/:addressBookId/contacts/import')
  @Permissions(ChurchPermission.MESSAGING_SEND)
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
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
  @Roles(ChurchUserRole.PRIEST, ChurchUserRole.ADMIN)
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
