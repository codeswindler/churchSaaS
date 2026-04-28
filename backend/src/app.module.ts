import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChurchModule } from './church/church.module';
import { ContributionsModule } from './contributions/contributions.module';
import { PaymentsModule } from './payments/payments.module';
import { PlatformModule } from './platform/platform.module';
import { PublicModule } from './public/public.module';
import { Church } from './entities/church.entity';
import { ChurchSubscription } from './entities/church-subscription.entity';
import { ChurchSubscriptionAdjustment } from './entities/church-subscription-adjustment.entity';
import { ChurchUser } from './entities/church-user.entity';
import { ClientEnquiry } from './entities/client-enquiry.entity';
import { Contribution } from './entities/contribution.entity';
import { Contributor } from './entities/contributor.entity';
import { FundAccount } from './entities/fund-account.entity';
import { PlatformUser } from './entities/platform-user.entity';
import { SmsBatch } from './entities/sms-batch.entity';
import { SmsOutbox } from './entities/sms-outbox.entity';
import { SmsModule } from './sms/sms.module';
import { ChurchSubscriptionsModule } from './subscriptions/church-subscriptions.module';
import { SchemaBootstrapService } from './common/schema-bootstrap.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'church_system',
      entities: [
        PlatformUser,
        Church,
        ChurchUser,
        ChurchSubscription,
        ChurchSubscriptionAdjustment,
        FundAccount,
        Contributor,
        Contribution,
        ClientEnquiry,
        SmsBatch,
        SmsOutbox,
      ],
      synchronize: (process.env.DB_SYNCHRONIZE || 'false') === 'true',
    }),
    AuthModule,
    SmsModule,
    PaymentsModule,
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
