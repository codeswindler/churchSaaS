import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Church } from '../entities/church.entity';
import { Contribution } from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { MobileDevice } from '../entities/mobile-device.entity';
import { ContributionsModule } from '../contributions/contributions.module';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { MobileAuthController } from './mobile-auth.controller';
import { MobileDevicesController } from './mobile-devices.controller';
import { MobileDevicesService } from './mobile-devices.service';
import { MobileFundsController } from './mobile-funds.controller';
import { MobileFundsGuard } from './mobile-funds.guard';
import { MobileFundsService } from './mobile-funds.service';
import { MobilePushModule } from './mobile-push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Church, FundAccount, Contribution, MobileDevice]),
    AuthModule,
    ContributionsModule,
    ChurchSubscriptionsModule,
    MobilePushModule,
  ],
  controllers: [
    MobileAuthController,
    MobileDevicesController,
    MobileFundsController,
  ],
  providers: [MobileDevicesService, MobileFundsGuard, MobileFundsService],
})
export class MobileModule {}
