import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChurchModule } from './church/church.module';
import { ContributionsModule } from './contributions/contributions.module';
import { PaymentsModule } from './payments/payments.module';
import { PlatformModule } from './platform/platform.module';
import { PublicModule } from './public/public.module';
import { Church } from './entities/church.entity';
import { ChurchSmsSender } from './entities/church-sms-sender.entity';
import { ChurchCongregationPage } from './entities/church-congregation-page.entity';
import { ChurchNotification } from './entities/church-notification.entity';
import { ChurchSubscription } from './entities/church-subscription.entity';
import { ChurchSubscriptionAdjustment } from './entities/church-subscription-adjustment.entity';
import { ChurchUser } from './entities/church-user.entity';
import { ClientEnquiry } from './entities/client-enquiry.entity';
import { Contribution } from './entities/contribution.entity';
import { Contributor } from './entities/contributor.entity';
import { DiscipleshipAttendance } from './entities/discipleship-attendance.entity';
import { DiscipleshipDuplicateReview } from './entities/discipleship-duplicate-review.entity';
import { DiscipleshipGroup } from './entities/discipleship-group.entity';
import { DiscipleshipMatchCandidate } from './entities/discipleship-match-candidate.entity';
import { DiscipleshipMemberAlias } from './entities/discipleship-member-alias.entity';
import { DiscipleshipMemberContributor } from './entities/discipleship-member-contributor.entity';
import { DiscipleshipMember } from './entities/discipleship-member.entity';
import { DiscipleshipMembership } from './entities/discipleship-membership.entity';
import { FundAccount } from './entities/fund-account.entity';
import { MobileB2cWithdrawal } from './entities/mobile-b2c-withdrawal.entity';
import { MobileDevice } from './entities/mobile-device.entity';
import { PlatformUser } from './entities/platform-user.entity';
import { PlatformSmsConfig } from './entities/platform-sms-config.entity';
import { SmsAddressBook } from './entities/sms-address-book.entity';
import { SmsAddressBookContact } from './entities/sms-address-book-contact.entity';
import { SmsBatch } from './entities/sms-batch.entity';
import { SmsOutbox } from './entities/sms-outbox.entity';
import { SmsSender } from './entities/sms-sender.entity';
import { SmsUnitPurchase } from './entities/sms-unit-purchase.entity';
import { SmsModule } from './sms/sms.module';
import { MobileModule } from './mobile/mobile.module';
import { ChurchSubscriptionsModule } from './subscriptions/church-subscriptions.module';
import { SchemaBootstrapService } from './common/schema-bootstrap.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'church_system',
      entities: [
        PlatformUser,
        PlatformSmsConfig,
        Church,
        ChurchSmsSender,
        ChurchCongregationPage,
        ChurchNotification,
        ChurchUser,
        ChurchSubscription,
        ChurchSubscriptionAdjustment,
        FundAccount,
        Contributor,
        DiscipleshipAttendance,
        DiscipleshipDuplicateReview,
        DiscipleshipGroup,
        DiscipleshipMatchCandidate,
        DiscipleshipMemberAlias,
        DiscipleshipMemberContributor,
        DiscipleshipMember,
        DiscipleshipMembership,
        Contribution,
        MobileB2cWithdrawal,
        MobileDevice,
        ClientEnquiry,
        SmsAddressBook,
        SmsAddressBookContact,
        SmsBatch,
        SmsOutbox,
        SmsSender,
        SmsUnitPurchase,
      ],
      synchronize: (process.env.DB_SYNCHRONIZE || 'false') === 'true',
    }),
    AuthModule,
    SmsModule,
    PaymentsModule,
    MobileModule,
    ChurchSubscriptionsModule,
    ContributionsModule,
    PlatformModule,
    ChurchModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [AppService, SchemaBootstrapService],
})
export class AppModule {}
