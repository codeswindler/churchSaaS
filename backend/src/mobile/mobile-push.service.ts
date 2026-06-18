import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { In, Repository } from 'typeorm';
import { ChurchUserRole } from '../entities/church-user.entity';
import {
  Contribution,
  ContributionStatus,
} from '../entities/contribution.entity';
import {
  MobileDevice,
  MobileDevicePlatform,
} from '../entities/mobile-device.entity';

@Injectable()
export class MobilePushService {
  private readonly logger = new Logger(MobilePushService.name);

  constructor(
    @InjectRepository(MobileDevice)
    private readonly mobileDeviceRepo: Repository<MobileDevice>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
  ) {}

  async notifyContributionConfirmed(contributionId: string) {
    const contribution = await this.contributionRepo.findOne({
      where: { id: contributionId },
      relations: ['fundAccount', 'church'],
    });

    if (
      !contribution ||
      contribution.status !== ContributionStatus.CONFIRMED ||
      !contribution.churchId
    ) {
      return;
    }

    const body = `${this.formatKes(Number(contribution.amount || 0))} received for ${contribution.fundAccountName || contribution.fundAccount?.name || 'Church fund'}`;
    await this.sendToPriestDevices(
      contribution.churchId,
      'Contribution received',
      body,
      {
        type: 'contribution_confirmed',
        contributionId: contribution.id,
        churchId: contribution.churchId,
        fundAccountId: contribution.fundAccountId || '',
        amount: `${Number(contribution.amount || 0)}`,
      },
    );
  }

  async notifyFundDisplayApprovalRequested(input: {
    notificationId: string;
    displayId: string;
    churchId: string;
    recipientUserId: string;
  }) {
    const tokens = await this.getApprovalReviewerDeviceTokens(
      input.churchId,
      input.recipientUserId,
    );
    await this.sendToDeviceTokens(
      tokens,
      'Fund display needs approval',
      'A public fund display was submitted for priest approval.',
      {
        type: 'fund_display_approval_requested',
        notificationId: input.notificationId,
        displayId: input.displayId,
        churchId: input.churchId,
      },
    );
  }

  private async sendToPriestDevices(
    churchId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    const tokens = await this.getPriestDeviceTokens(churchId);
    await this.sendToDeviceTokens(tokens, title, body, data);
  }

  private async sendToDeviceTokens(
    tokens: string[],
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    if (tokens.length === 0) return;

    const messaging = this.getMessaging();
    if (!messaging) {
      this.logger.log(
        `[mobile-push] FCM not configured; would notify ${tokens.length} device(s): ${title} - ${body}`,
      );
      return;
    }

    for (const tokenChunk of this.chunk(tokens, 500)) {
      const response = await messaging.sendEachForMulticast({
        tokens: tokenChunk,
        notification: { title, body },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'fund_updates',
          },
        },
      });

      const invalidTokens = response.responses
        .map((item, index) => ({ item, token: tokenChunk[index] }))
        .filter(({ item }) =>
          [
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered',
          ].includes(item.error?.code || ''),
        )
        .map(({ token }) => token);

      if (invalidTokens.length > 0) {
        await this.mobileDeviceRepo.update(
          { fcmToken: In(invalidTokens) },
          { isActive: false, deactivatedAt: new Date() },
        );
      }
    }
  }

  private async getPriestDeviceTokens(churchId: string) {
    const rows = await this.mobileDeviceRepo
      .createQueryBuilder('device')
      .innerJoin('church_users', 'user', 'user.id = device.churchUserId')
      .select('device.fcmToken', 'fcmToken')
      .where('device.churchId = :churchId', { churchId })
      .andWhere('device.isActive = :isActive', { isActive: true })
      .andWhere('user.isActive = :userIsActive', { userIsActive: true })
      .andWhere('user.role IN (:...roles)', {
        roles: [ChurchUserRole.PRIEST, 'church_admin'],
      })
      .getRawMany<{ fcmToken: string }>();

    return [...new Set(rows.map((row) => row.fcmToken).filter(Boolean))];
  }

  private async getApprovalReviewerDeviceTokens(
    churchId: string,
    churchUserId: string,
  ) {
    const rows = await this.mobileDeviceRepo
      .createQueryBuilder('device')
      .innerJoin('church_users', 'user', 'user.id = device.churchUserId')
      .select('device.fcmToken', 'fcmToken')
      .where('device.churchId = :churchId', { churchId })
      .andWhere('device.churchUserId = :churchUserId', { churchUserId })
      .andWhere('device.platform = :platform', {
        platform: MobileDevicePlatform.ANDROID,
      })
      .andWhere('device.isActive = :isActive', { isActive: true })
      .andWhere('user.isActive = :userIsActive', { userIsActive: true })
      .andWhere('user.role = :role', { role: ChurchUserRole.PRIEST })
      .getRawMany<{ fcmToken: string }>();

    return [...new Set(rows.map((row) => row.fcmToken).filter(Boolean))];
  }

  private getMessaging() {
    const projectId =
      process.env.FCM_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const clientEmail =
      process.env.FCM_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (
      process.env.FCM_PRIVATE_KEY ||
      process.env.FIREBASE_PRIVATE_KEY ||
      ''
    ).replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    return getMessaging();
  }

  private formatKes(amount: number) {
    return `KES ${amount.toLocaleString('en-KE', {
      maximumFractionDigits: 0,
    })}`;
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
