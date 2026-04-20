import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  addDays,
  computeCountdown,
  GRACE_PERIOD_DAYS,
} from '../common/subscription.utils';
import { Church, ChurchStatus } from '../entities/church.entity';
import {
  ChurchSubscriptionAdjustment,
  ChurchSubscriptionAdjustmentAction,
} from '../entities/church-subscription-adjustment.entity';
import {
  ChurchSubscription,
  ChurchSubscriptionStatus,
} from '../entities/church-subscription.entity';

@Injectable()
export class ChurchSubscriptionsService {
  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchSubscription)
    private readonly subscriptionRepo: Repository<ChurchSubscription>,
    @InjectRepository(ChurchSubscriptionAdjustment)
    private readonly adjustmentRepo: Repository<ChurchSubscriptionAdjustment>,
  ) {}

  async initializeSubscription(
    churchId: string,
    days = 30,
    performedByPlatformUserId?: string,
    planName = 'Standard Plan',
  ) {
    const startsAt = new Date();
    const expiresAt = addDays(startsAt, days);

    const subscription = this.subscriptionRepo.create({
      churchId,
      startsAt,
      expiresAt,
      graceEndsAt: addDays(expiresAt, GRACE_PERIOD_DAYS),
      status: ChurchSubscriptionStatus.ACTIVE,
      planName,
      planCode: 'standard',
      notes: 'Initial church subscription',
    });

    const saved = await this.subscriptionRepo.save(subscription);
    await this.recordAdjustment(saved, {
      actionType: ChurchSubscriptionAdjustmentAction.ACTIVATE,
      daysDelta: days,
      beforeExpiresAt: null,
      afterExpiresAt: expiresAt,
      performedByPlatformUserId: performedByPlatformUserId || null,
      reason: 'Initial subscription',
    });

    return this.getChurchSubscriptionStatus(churchId);
  }

  async getCurrentSubscription(churchId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { churchId },
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.syncSubscriptionState(subscription);
  }

  async getChurchSubscriptionStatus(churchId: string) {
    const subscription = await this.getCurrentSubscription(churchId);
    return this.buildSnapshot(subscription);
  }

  async assertChurchCanOperate(churchId: string) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    if (church.status !== ChurchStatus.ACTIVE) {
      throw new ForbiddenException('Church account is inactive');
    }

    const subscription = await this.getChurchSubscriptionStatus(churchId);
    if (subscription.status === ChurchSubscriptionStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Church subscription has expired and is suspended',
      );
    }

    return subscription;
  }

  async addDays(
    churchId: string,
    days: number,
    performedByPlatformUserId?: string,
    reason?: string,
  ) {
    if (!days || days < 1) {
      throw new BadRequestException('Days must be at least 1');
    }

    const subscription = await this.getCurrentSubscription(churchId);
    const beforeExpiresAt = subscription.expiresAt;
    const baseDate =
      subscription.expiresAt > new Date() ? subscription.expiresAt : new Date();
    subscription.expiresAt = addDays(baseDate, days);
    subscription.graceEndsAt = addDays(
      subscription.expiresAt,
      GRACE_PERIOD_DAYS,
    );
    subscription.status = ChurchSubscriptionStatus.ACTIVE;
    const saved = await this.subscriptionRepo.save(subscription);

    await this.recordAdjustment(saved, {
      actionType: ChurchSubscriptionAdjustmentAction.ADD_DAYS,
      daysDelta: days,
      beforeExpiresAt,
      afterExpiresAt: saved.expiresAt,
      performedByPlatformUserId: performedByPlatformUserId || null,
      reason: reason || 'Subscription extended',
    });

    return this.buildSnapshot(saved);
  }

  async subtractDays(
    churchId: string,
    days: number,
    performedByPlatformUserId?: string,
    reason?: string,
  ) {
    if (!days || days < 1) {
      throw new BadRequestException('Days must be at least 1');
    }

    const subscription = await this.getCurrentSubscription(churchId);
    const beforeExpiresAt = subscription.expiresAt;
    subscription.expiresAt = addDays(subscription.expiresAt, -days);
    subscription.graceEndsAt = addDays(
      subscription.expiresAt,
      GRACE_PERIOD_DAYS,
    );
    const saved = await this.syncSubscriptionState(subscription);

    await this.recordAdjustment(saved, {
      actionType: ChurchSubscriptionAdjustmentAction.SUBTRACT_DAYS,
      daysDelta: -days,
      beforeExpiresAt,
      afterExpiresAt: saved.expiresAt,
      performedByPlatformUserId: performedByPlatformUserId || null,
      reason: reason || 'Subscription reduced',
    });

    return this.buildSnapshot(saved);
  }

  async suspend(
    churchId: string,
    performedByPlatformUserId?: string,
    reason?: string,
  ) {
    const subscription = await this.getCurrentSubscription(churchId);
    const beforeExpiresAt = subscription.expiresAt;
    subscription.status = ChurchSubscriptionStatus.SUSPENDED;
    subscription.graceEndsAt = new Date();
    const saved = await this.subscriptionRepo.save(subscription);

    await this.recordAdjustment(saved, {
      actionType: ChurchSubscriptionAdjustmentAction.SUSPEND,
      daysDelta: 0,
      beforeExpiresAt,
      afterExpiresAt: saved.expiresAt,
      performedByPlatformUserId: performedByPlatformUserId || null,
      reason: reason || 'Suspended by platform admin',
    });

    return this.buildSnapshot(saved);
  }

  async reactivate(
    churchId: string,
    days = 30,
    performedByPlatformUserId?: string,
    reason?: string,
  ) {
    if (!days || days < 1) {
      throw new BadRequestException('Days must be at least 1');
    }

    const subscription = await this.getCurrentSubscription(churchId);
    const beforeExpiresAt = subscription.expiresAt;
    subscription.startsAt = new Date();
    subscription.expiresAt = addDays(subscription.startsAt, days);
    subscription.graceEndsAt = addDays(
      subscription.expiresAt,
      GRACE_PERIOD_DAYS,
    );
    subscription.status = ChurchSubscriptionStatus.ACTIVE;
    const saved = await this.subscriptionRepo.save(subscription);

    await this.recordAdjustment(saved, {
      actionType: ChurchSubscriptionAdjustmentAction.REACTIVATE,
      daysDelta: days,
      beforeExpiresAt,
      afterExpiresAt: saved.expiresAt,
      performedByPlatformUserId: performedByPlatformUserId || null,
      reason: reason || 'Reactivated by platform admin',
    });

    return this.buildSnapshot(saved);
  }

  async getSubscriptionHistory(churchId: string) {
    return this.adjustmentRepo.find({
      where: { churchId },
      relations: ['performedByPlatformUser'],
      order: { createdAt: 'DESC' },
    });
  }

  async getAllChurchSnapshots() {
    const subscriptions = await this.subscriptionRepo.find({
      relations: ['church'],
      order: { createdAt: 'DESC' },
    });

    const latestByChurch = new Map<string, ChurchSubscription>();
    for (const subscription of subscriptions) {
      if (!latestByChurch.has(subscription.churchId)) {
        latestByChurch.set(
          subscription.churchId,
          await this.syncSubscriptionState(subscription),
        );
      }
    }

    return Array.from(latestByChurch.values()).map((subscription) => ({
      church: subscription.church,
      ...this.buildSnapshot(subscription),
    }));
  }

  private async syncSubscriptionState(subscription: ChurchSubscription) {
    let shouldSave = false;
    const now = new Date();

    if (!subscription.graceEndsAt) {
      subscription.graceEndsAt = addDays(
        subscription.expiresAt,
        GRACE_PERIOD_DAYS,
      );
      shouldSave = true;
    }

    if (subscription.status !== ChurchSubscriptionStatus.SUSPENDED) {
      if (subscription.expiresAt <= now && subscription.graceEndsAt > now) {
        if (subscription.status !== ChurchSubscriptionStatus.GRACE) {
          subscription.status = ChurchSubscriptionStatus.GRACE;
          shouldSave = true;
        }
      } else if (subscription.graceEndsAt <= now) {
        subscription.status = ChurchSubscriptionStatus.SUSPENDED;
        shouldSave = true;
      } else if (subscription.expiresAt > now) {
        if (subscription.status !== ChurchSubscriptionStatus.ACTIVE) {
          subscription.status = ChurchSubscriptionStatus.ACTIVE;
          shouldSave = true;
        }
      }
    }

    if (shouldSave) {
      return this.subscriptionRepo.save(subscription);
    }

    return subscription;
  }

  private buildSnapshot(subscription: ChurchSubscription) {
    const target =
      subscription.status === ChurchSubscriptionStatus.GRACE
        ? subscription.graceEndsAt
        : subscription.status === ChurchSubscriptionStatus.SUSPENDED
          ? null
          : subscription.expiresAt;
    const countdown = computeCountdown(target);

    return {
      id: subscription.id,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt,
      graceEndsAt: subscription.graceEndsAt,
      planCode: subscription.planCode,
      planName: subscription.planName,
      notes: subscription.notes,
      status: subscription.status,
      countdown: {
        days: countdown.days,
        hours: countdown.hours,
        minutes: countdown.minutes,
        seconds: countdown.seconds,
        expired: countdown.expired,
        totalMs: countdown.totalMs,
        label:
          subscription.status === ChurchSubscriptionStatus.GRACE
            ? 'Grace ends in'
            : subscription.status === ChurchSubscriptionStatus.SUSPENDED
              ? 'Suspended'
              : 'Subscription ends in',
      },
    };
  }

  private async recordAdjustment(
    subscription: ChurchSubscription,
    data: {
      actionType: ChurchSubscriptionAdjustmentAction;
      daysDelta: number;
      beforeExpiresAt: Date | null;
      afterExpiresAt: Date | null;
      performedByPlatformUserId: string | null;
      reason: string | null;
    },
  ) {
    const adjustment = this.adjustmentRepo.create({
      churchId: subscription.churchId,
      subscriptionId: subscription.id,
      actionType: data.actionType,
      daysDelta: data.daysDelta,
      beforeExpiresAt: data.beforeExpiresAt,
      afterExpiresAt: data.afterExpiresAt,
      performedByPlatformUserId: data.performedByPlatformUserId,
      reason: data.reason,
    });
    await this.adjustmentRepo.save(adjustment);
  }
}
