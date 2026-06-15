import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contribution } from '../entities/contribution.entity';
import { MobileDevice } from '../entities/mobile-device.entity';
import { MobilePushService } from './mobile-push.service';

@Module({
  imports: [TypeOrmModule.forFeature([MobileDevice, Contribution])],
  providers: [MobilePushService],
  exports: [MobilePushService],
})
export class MobilePushModule {}
