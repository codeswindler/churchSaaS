import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ContributionsModule } from '../contributions/contributions.module';
import { Church } from '../entities/church.entity';
import { ChurchUser } from '../entities/church-user.entity';
import { Contributor } from '../entities/contributor.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { SmsAddressBook } from '../entities/sms-address-book.entity';
import { SmsAddressBookContact } from '../entities/sms-address-book-contact.entity';
import { SmsModule } from '../sms/sms.module';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { ChurchController } from './church.controller';
import { ChurchService } from './church.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Church,
      ChurchUser,
      FundAccount,
      Contributor,
      SmsAddressBook,
      SmsAddressBookContact,
    ]),
    AuthModule,
    ChurchSubscriptionsModule,
    ContributionsModule,
    SmsModule,
  ],
  controllers: [ChurchController],
  providers: [ChurchService],
})
export class ChurchModule {}
