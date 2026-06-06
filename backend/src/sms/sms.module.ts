import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Church } from '../entities/church.entity';
import { Contribution } from '../entities/contribution.entity';
import { Contributor } from '../entities/contributor.entity';
import { PlatformSmsConfig } from '../entities/platform-sms-config.entity';
import { SmsAddressBookContact } from '../entities/sms-address-book-contact.entity';
import { SmsBatch } from '../entities/sms-batch.entity';
import { SmsOutbox } from '../entities/sms-outbox.entity';
import { SmsUnitPurchase } from '../entities/sms-unit-purchase.entity';
import { PaymentsModule } from '../payments/payments.module';
import { SmsDlrController } from './sms-dlr.controller';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [
    ConfigModule,
    PaymentsModule,
    TypeOrmModule.forFeature([
      Church,
      Contribution,
      Contributor,
      PlatformSmsConfig,
      SmsAddressBookContact,
      SmsBatch,
      SmsOutbox,
      SmsUnitPurchase,
    ]),
  ],
  providers: [SmsService],
  controllers: [SmsController, SmsDlrController],
  exports: [SmsService],
})
export class SmsModule {}
