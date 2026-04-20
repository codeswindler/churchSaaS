import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Church } from '../entities/church.entity';
import { ChurchSubscriptionAdjustment } from '../entities/church-subscription-adjustment.entity';
import { ChurchSubscription } from '../entities/church-subscription.entity';
import { ChurchSubscriptionsService } from './church-subscriptions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Church,
      ChurchSubscription,
      ChurchSubscriptionAdjustment,
    ]),
  ],
  providers: [ChurchSubscriptionsService],
  exports: [ChurchSubscriptionsService],
})
export class ChurchSubscriptionsModule {}
