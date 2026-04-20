import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionsModule } from '../contributions/contributions.module';
import { Church } from '../entities/church.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PublicController } from './public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Church, FundAccount]),
    ChurchSubscriptionsModule,
    ContributionsModule,
  ],
  controllers: [PublicController, PaymentsWebhookController],
})
export class PublicModule {}
