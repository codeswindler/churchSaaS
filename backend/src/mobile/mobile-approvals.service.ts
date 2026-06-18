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
    const filtered =
      status === 'all'
        ? displays
        : displays.filter((display) => display.approvalStatus === status);

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

  private mapDisplay(display: any) {
    return {
      id: display.id,
      title: display.title || null,
      fundAccountId: display.fundAccountId,
      fundAccountName: display.fundAccountName,
      fundAccountCode: display.fundAccountCode || null,
      approvalStatus: display.approvalStatus,
      displayStatus: display.displayStatus,
      startDate: display.startDate,
      endDate: display.endDate || null,
      endMode: display.endMode,
      totalAmount: Number(display.totalAmount || 0),
      contributionCount: Number(display.contributionCount || 0),
      createdAt: display.createdAt || null,
      createdByUserId:
        display.createdByUserId || display.requestedByUserId || null,
      updatedAt: display.updatedAt || null,
      updatedByUserId: display.updatedByUserId || null,
      requestedByUserId: display.requestedByUserId || null,
    };
  }
}
