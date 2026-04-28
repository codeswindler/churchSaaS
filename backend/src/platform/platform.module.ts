import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionsModule } from '../contributions/contributions.module';
import { Church } from '../entities/church.entity';
import { ChurchUser } from '../entities/church-user.entity';
import { ClientEnquiry } from '../entities/client-enquiry.entity';
import { Contribution } from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { SmsOutbox } from '../entities/sms-outbox.entity';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformUser,
      Church,
      ChurchUser,
      Contribution,
      FundAccount,
      ClientEnquiry,
      SmsOutbox,
    ]),
    ChurchSubscriptionsModule,
    ContributionsModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
