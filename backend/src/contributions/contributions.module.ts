import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Church } from '../entities/church.entity';
import { ChurchUser } from '../entities/church-user.entity';
import { Contribution } from '../entities/contribution.entity';
import { Contributor } from '../entities/contributor.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { PaymentsModule } from '../payments/payments.module';
import { SmsModule } from '../sms/sms.module';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { ContributionsService } from './contributions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Church,
      ChurchUser,
      FundAccount,
      Contributor,
      Contribution,
    ]),
    SmsModule,
    PaymentsModule,
    ChurchSubscriptionsModule,
  ],
  providers: [ContributionsService],
  exports: [ContributionsService],
})
export class ContributionsModule {}
