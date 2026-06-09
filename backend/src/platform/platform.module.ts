import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionsModule } from '../contributions/contributions.module';
import { Church } from '../entities/church.entity';
import { ChurchSmsSender } from '../entities/church-sms-sender.entity';
import { ChurchUser } from '../entities/church-user.entity';
import { ClientEnquiry } from '../entities/client-enquiry.entity';
import { Contribution } from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { PlatformSmsConfig } from '../entities/platform-sms-config.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { SmsOutbox } from '../entities/sms-outbox.entity';
import { SmsSender } from '../entities/sms-sender.entity';
import { SmsUnitPurchase } from '../entities/sms-unit-purchase.entity';
import { SmsModule } from '../sms/sms.module';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformUser,
      PlatformSmsConfig,
      Church,
      ChurchSmsSender,
      ChurchUser,
      Contribution,
      FundAccount,
      ClientEnquiry,
      SmsOutbox,
      SmsSender,
      SmsUnitPurchase,
    ]),
    ChurchSubscriptionsModule,
    ContributionsModule,
    SmsModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
