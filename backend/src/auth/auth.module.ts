import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Church } from '../entities/church.entity';
import { ChurchUser } from '../entities/church-user.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { ChurchSubscriptionsModule } from '../subscriptions/church-subscriptions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ChurchAccessGuard } from './church-access.guard';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformUser, ChurchUser, Church]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:
          process.env.JWT_SECRET || 'church-system-secret-change-in-production',
        signOptions: { expiresIn: '7d' },
      }),
    }),
    ChurchSubscriptionsModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    ChurchAccessGuard,
    RolesGuard,
    PermissionsGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, ChurchAccessGuard, RolesGuard, PermissionsGuard],
})
export class AuthModule {}
