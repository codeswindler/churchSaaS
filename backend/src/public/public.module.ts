import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionsModule } from '../contributions/contributions.module';
import { ChurchCongregationPage } from '../entities/church-congregation-page.entity';
import { Church } from '../entities/church.entity';
import { ClientEnquiry } from '../entities/client-enquiry.entity';
import { Contribution } from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { C2BWebhookController } from './c2b-webhook.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PublicController } from './public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Church,
      ChurchCongregationPage,
      FundAccount,
      ClientEnquiry,
      Contribution,
    ]),
    ChurchSubscriptionsModule,
    ContributionsModule,
  ],
  controllers: [
    PublicController,
    PaymentsWebhookController,
    C2BWebhookController,
  ],
})
export class PublicModule {}
