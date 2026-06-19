import { Injectable } from '@nestjs/common';
import { ChurchService } from '../church/church.service';

@Injectable()
export class MobileApprovalsService {
  constructor(private readonly churchService: ChurchService) {}

  listNotifications(churchId: string, userId: string, query: any = {}) {
    return this.churchService.listChurchNotifications(churchId, userId, query);
  }

  markNotificationRead(
    churchId: string,
    userId: string,
    notificationId: string,
  ) {
    return this.churchService.markChurchNotificationRead(
      churchId,
      userId,
      notificationId,
    );
  }

  async listFundDisplayApprovals(churchId: string, query: any = {}) {
    const displays =
      await this.churchService.listCongregationFundDisplays(churchId);
    const status = `${query?.status || 'pending'}`.trim().toLowerCase();
    const byApproval =
      status === 'all'
        ? displays
        : displays.filter((display) => display.approvalStatus === status);
    const displayStatus = `${query?.displayStatus || ''}`.trim().toLowerCase();
    const filtered = displayStatus
      ? byApproval.filter(
          (display) =>
            `${display.displayStatus || ''}`.toLowerCase() === displayStatus,
        )
      : byApproval;

    return { data: filtered.map((display) => this.mapDisplay(display)) };
  }

  reviewFundDisplay(
    churchId: string,
    userId: string,
    displayId: string,
    action: 'approve' | 'reject',
    options: {
      durationMinutes?: number | string | null;
      note?: string | null;
    } = {},
  ) {
    return this.churchService.reviewCongregationFundDisplay(
      churchId,
      userId,
      displayId,
      action,
      options,
    );
  }

  updateFundDisplayDuration(
    churchId: string,
    userId: string,
    displayId: string,
    options: {
      durationMinutes?: number | string | null;
      mode?: 'replace' | 'extend' | null;
      note?: string | null;
    },
  ) {
    return this.churchService.updateCongregationFundDisplayDuration(
      churchId,
      userId,
      displayId,
      options,
    );
  }

  cancelFundDisplay(churchId: string, userId: string, displayId: string) {
    return this.churchService.deleteCongregationFundDisplay(
      churchId,
      userId,
      displayId,
    );
  }

  private mapDisplay(display: any) {
    return {
      id: display.id,
      title: display.title || null,
      description: display.description || null,
      fundAccountId: display.fundAccountId,
      fundAccountName: display.fundAccountName,
      fundAccountCode: display.fundAccountCode || null,
      approvalStatus: display.approvalStatus,
      displayStatus: display.displayStatus,
      startDate: display.startDate,
      endDate: display.endDate || null,
      endMode: display.endMode,
      targetAmount:
        Number(display.targetAmount || 0) > 0
          ? Number(display.targetAmount)
          : null,
      totalAmount: Number(display.totalAmount || 0),
      contributionCount: Number(display.contributionCount || 0),
      approvalDurationMinutes: display.approvalDurationMinutes || null,
      visibleFrom: display.visibleFrom || null,
      visibleUntil: display.visibleUntil || null,
      approvalNote: display.approvalNote || null,
      createdAt: display.createdAt || null,
      createdByUserId:
        display.createdByUserId || display.requestedByUserId || null,
      updatedAt: display.updatedAt || null,
      updatedByUserId: display.updatedByUserId || null,
      requestedByUserId: display.requestedByUserId || null,
    };
  }
}
