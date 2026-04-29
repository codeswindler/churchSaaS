import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Church } from '../entities/church.entity';
import { Contribution } from '../entities/contribution.entity';
import { Contributor } from '../entities/contributor.entity';
import { SmsAddressBookContact } from '../entities/sms-address-book-contact.entity';
import { SmsBatch } from '../entities/sms-batch.entity';
import { SmsOutbox } from '../entities/sms-outbox.entity';
import { SmsDlrController } from './sms-dlr.controller';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Church,
      Contribution,
      Contributor,
      SmsAddressBookContact,
      SmsBatch,
      SmsOutbox,
    ]),
  ],
  providers: [SmsService],
  controllers: [SmsController, SmsDlrController],
  exports: [SmsService],
})
export class SmsModule {}
