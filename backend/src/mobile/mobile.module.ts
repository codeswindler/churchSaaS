import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Church } from '../entities/church.entity';
import { Contribution } from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { ChurchUser } from '../entities/church-user.entity';
import { MobileDevice } from '../entities/mobile-device.entity';
import { ContributionsModule } from '../contributions/contributions.module';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { MobileAuthController } from './mobile-auth.controller';
import { ChurchModule } from '../church/church.module';
import { MobileApprovalsController } from './mobile-approvals.controller';
import { MobileApprovalsGuard } from './mobile-approvals.guard';
import { MobileApprovalsService } from './mobile-approvals.service';
import { MobileDevicesController } from './mobile-devices.controller';
import { MobileDevicesService } from './mobile-devices.service';
import { MobileFundsController } from './mobile-funds.controller';
import { MobileFundsGuard } from './mobile-funds.guard';
import { MobileFundsService } from './mobile-funds.service';
import { MobilePushModule } from './mobile-push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Church,
      ChurchUser,
      FundAccount,
      Contribution,
      MobileDevice,
    ]),
    AuthModule,
    ChurchModule,
    ContributionsModule,
    ChurchSubscriptionsModule,
    MobilePushModule,
  ],
  controllers: [
    MobileAuthController,
    MobileApprovalsController,
    MobileDevicesController,
    MobileFundsController,
  ],
  providers: [
    MobileApprovalsGuard,
    MobileApprovalsService,
    MobileDevicesService,
    MobileFundsGuard,
    MobileFundsService,
  ],
})
export class MobileModule {}
