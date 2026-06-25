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

  async listActiveFundDisplays(churchId: string) {
    return this.listFundDisplayApprovals(churchId, {
      status: 'approved',
      displayStatus: 'active',
    });
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
      lastContributionAt: display.lastContributionAt || null,
      todayAmount: Number(display.todayAmount || 0),
      todayContributionCount: Number(display.todayContributionCount || 0),
      monthAmount: Number(display.monthAmount || 0),
      monthContributionCount: Number(display.monthContributionCount || 0),
      remainingAmount:
        display.remainingAmount === null || display.remainingAmount === undefined
          ? null
          : Number(display.remainingAmount || 0),
      progressPercentage:
        display.progressPercentage === null ||
        display.progressPercentage === undefined
          ? null
          : Number(display.progressPercentage || 0),
      trendByDate: Array.isArray(display.trendByDate)
        ? display.trendByDate.map((point: any) => ({
            date: point.date,
            totalAmount: Number(point.totalAmount || 0),
            count: Number(point.count || 0),
          }))
        : [],
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
