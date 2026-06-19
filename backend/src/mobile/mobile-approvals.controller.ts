import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MobileApprovalsGuard } from './mobile-approvals.guard';
import { MobileApprovalsService } from './mobile-approvals.service';

interface MobileApprovalRequest {
  user: {
    id: string;
    churchId: string;
  };
}

interface MobileApprovalBody {
  [key: string]: unknown;
  durationMinutes?: number;
  mode?: 'replace' | 'extend';
  note?: string;
}

@Controller('mobile')
@UseGuards(MobileApprovalsGuard)
export class MobileApprovalsController {
  constructor(
    private readonly mobileApprovalsService: MobileApprovalsService,
  ) {}

  @Get('notifications')
  listNotifications(
    @Request() req: MobileApprovalRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.mobileApprovalsService.listNotifications(
      req.user.churchId,
      req.user.id,
      query,
    );
  }

  @Patch('notifications/:notificationId/read')
  markNotificationRead(
    @Request() req: MobileApprovalRequest,
    @Param('notificationId') notificationId: string,
  ) {
    return this.mobileApprovalsService.markNotificationRead(
      req.user.churchId,
      req.user.id,
      notificationId,
    );
  }

  @Get('fund-display-approvals')
  listFundDisplayApprovals(
    @Request() req: MobileApprovalRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.mobileApprovalsService.listFundDisplayApprovals(
      req.user.churchId,
      query,
    );
  }

  @Post('fund-display-approvals/:displayId/approve')
  approveFundDisplay(
    @Request() req: MobileApprovalRequest,
    @Param('displayId') displayId: string,
    @Body() body: MobileApprovalBody,
  ) {
    return this.mobileApprovalsService.reviewFundDisplay(
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

  @Post('fund-display-approvals/:displayId/reject')
  rejectFundDisplay(
    @Request() req: MobileApprovalRequest,
    @Param('displayId') displayId: string,
    @Body() body: MobileApprovalBody,
  ) {
    return this.mobileApprovalsService.reviewFundDisplay(
      req.user.churchId,
      req.user.id,
      displayId,
      'reject',
      { note: body?.note },
    );
  }

  @Post('fund-display-approvals/:displayId/duration')
  updateFundDisplayDuration(
    @Request() req: MobileApprovalRequest,
    @Param('displayId') displayId: string,
    @Body() body: MobileApprovalBody,
  ) {
    return this.mobileApprovalsService.updateFundDisplayDuration(
      req.user.churchId,
      req.user.id,
      displayId,
      {
        durationMinutes: body?.durationMinutes,
        mode: body?.mode,
        note: body?.note,
      },
    );
  }

  @Delete('fund-display-approvals/:displayId')
  cancelFundDisplay(
    @Request() req: MobileApprovalRequest,
    @Param('displayId') displayId: string,
  ) {
    return this.mobileApprovalsService.cancelFundDisplay(
      req.user.churchId,
      req.user.id,
      displayId,
    );
  }
}
