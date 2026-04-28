import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  ChurchPermission,
  PERMISSION_FEATURE_MAP,
  normalizeFeatureList,
  resolveChurchPermissions,
} from '../common/access-control';
import { sanitizeChurchForTenant } from '../common/church.utils';
import { ChurchStatus } from '../entities/church.entity';
import { ChurchUser } from '../entities/church-user.entity';
import {
  PlatformUser,
  PlatformUserRole,
} from '../entities/platform-user.entity';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    private readonly jwtService: JwtService,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
  ) {}

  async createInitialPlatformAdmin(
    email: string,
    password: string,
    name = 'Platform Admin',
  ) {
    const count = await this.platformUserRepo.count();
    if (count > 0) {
      throw new BadRequestException('Platform admin already exists');
    }

    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = this.platformUserRepo.create({
      name,
      email: email.trim().toLowerCase(),
      username: 'platform-admin',
      passwordHash: await bcrypt.hash(password, 10),
      role: PlatformUserRole.PLATFORM_ADMIN,
      isActive: true,
    });

    await this.platformUserRepo.save(user);
    return this.buildAuthResponse(user, 'platform');
  }

  async login(identifier: string, password: string) {
    const [platformUser, churchUser] = await Promise.all([
      this.findPlatformIdentity(identifier),
      this.findChurchIdentity(identifier),
    ]);

    const matches: Array<Record<string, any>> = [];

    const platformResponse = await this.tryAuthenticatePlatformUser(
      platformUser,
      password,
    );
    if (platformResponse) {
      matches.push(platformResponse);
    }

    const churchResponse = await this.tryAuthenticateChurchUser(
      churchUser,
      password,
    );
    if (churchResponse) {
      matches.push(churchResponse);
    }

    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      throw new ConflictException(
        'Multiple accounts matched this sign-in. Use a unique email, username, or phone.',
      );
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async platformLogin(identifier: string, password: string) {
    const response = await this.tryAuthenticatePlatformUser(
      await this.findPlatformIdentity(identifier),
      password,
    );
    if (!response) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return response;
  }

  async churchLogin(identifier: string, password: string) {
    const response = await this.tryAuthenticateChurchUser(
      await this.findChurchIdentity(identifier),
      password,
    );
    if (!response) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return response;
  }

  async getProfile(user: any) {
    if (user.userType === 'platform') {
      const platformUser = await this.platformUserRepo.findOne({
        where: { id: user.id },
      });
      if (!platformUser) {
        throw new NotFoundException('User not found');
      }

      const { passwordHash: _, ...result } = platformUser;
      return { ...result, userType: 'platform' };
    }

    const churchUser = await this.churchUserRepo.findOne({
      where: { id: user.id },
      relations: ['church'],
    });
    if (!churchUser) {
      throw new NotFoundException('User not found');
    }

    const subscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        churchUser.churchId,
      );
    const { passwordHash: _, ...result } = churchUser;
    const access = this.buildChurchAccess(churchUser);

    return {
      ...result,
      userType: 'church',
      church: sanitizeChurchForTenant(churchUser.church),
      subscription,
      ...access,
    };
  }

  async updateProfile(user: any, body: any) {
    if (user.userType === 'platform') {
      const platformUser = await this.platformUserRepo.findOne({
        where: { id: user.id },
      });
      if (!platformUser) {
        throw new NotFoundException('User not found');
      }

      const payload = await this.applyProfileChanges(
        platformUser,
        body,
        async (email, username, phone) => {
          await this.ensurePlatformIdentityIsAvailable(
            platformUser.id,
            email,
            username,
            phone,
          );
        },
      );

      const savedUser = await this.platformUserRepo.save(payload);
      const { passwordHash: _, ...result } = savedUser;
      return { ...result, userType: 'platform' };
    }

    const churchUser = await this.churchUserRepo.findOne({
      where: { id: user.id },
      relations: ['church'],
    });
    if (!churchUser) {
      throw new NotFoundException('User not found');
    }

    const payload = await this.applyProfileChanges(
      churchUser,
      body,
      async (email, username, phone) => {
        await this.ensureChurchIdentityIsAvailable(
          churchUser.id,
          email,
          username,
          phone,
        );
      },
    );

    const savedUser = await this.churchUserRepo.save(payload);
    const subscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        savedUser.churchId,
      );
    const { passwordHash: _, ...result } = savedUser;
    const access = this.buildChurchAccess(savedUser);

    return {
      ...result,
      userType: 'church',
      church: sanitizeChurchForTenant(churchUser.church),
      subscription,
      ...access,
    };
  }

  private buildAuthResponse(
    user: PlatformUser | ChurchUser,
    userType: 'platform' | 'church',
    extra: Record<string, any> = {},
  ) {
    const access =
      userType === 'church' ? this.buildChurchAccess(user as ChurchUser) : {};
    const payload = {
      sub: user.id,
      role: user.role,
      userType,
      churchId: userType === 'church' ? (user as ChurchUser).churchId : null,
      ...(userType === 'church' ? access : {}),
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        phone: user.phone,
        role: user.role,
        userType,
        ...(userType === 'church'
          ? { churchId: (user as ChurchUser).churchId }
          : {}),
        ...(userType === 'church' ? access : {}),
      },
      ...extra,
    };
  }

  private buildChurchAccess(user: ChurchUser) {
    const enabledFeatures = normalizeFeatureList(user.church?.enabledFeatures);
    const permissions = resolveChurchPermissions(
      user.role,
      user.permissionOverrides,
    ).filter((permission) =>
      permission === ChurchPermission.DASHBOARD_VIEW ||
      enabledFeatures.includes(PERMISSION_FEATURE_MAP[permission]),
    );

    return {
      enabledFeatures,
      permissionOverrides: user.permissionOverrides || [],
      permissions,
    };
  }

  private async findPlatformIdentity(identifier: string) {
    const normalized = this.normalizeIdentifier(identifier);
    if (!normalized) {
      return null;
    }

    return this.platformUserRepo.findOne({
      where: [
        { email: normalized.toLowerCase() },
        { username: normalized },
        { phone: normalized },
      ],
    });
  }

  private async findChurchIdentity(identifier: string) {
    const normalized = this.normalizeIdentifier(identifier);
    if (!normalized) {
      return null;
    }

    return this.churchUserRepo.findOne({
      where: [
        { email: normalized.toLowerCase() },
        { username: normalized },
        { phone: normalized },
      ],
      relations: ['church'],
    });
  }

  private async tryAuthenticatePlatformUser(
    user: PlatformUser | null,
    password: string,
  ) {
    if (!user || !user.isActive || !password) {
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return null;
    }

    return this.buildAuthResponse(user, 'platform');
  }

  private async tryAuthenticateChurchUser(
    user: ChurchUser | null,
    password: string,
  ) {
    if (!user || !user.isActive || !password) {
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return null;
    }

    if (!user.church || user.church.status !== ChurchStatus.ACTIVE) {
      throw new UnauthorizedException('Church account is inactive');
    }

    const subscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        user.churchId,
      );

    if (subscription.status === 'suspended') {
      throw new UnauthorizedException(
        'Church subscription is suspended. Please contact support.',
      );
    }

    return this.buildAuthResponse(user, 'church', {
      church: {
        id: user.church.id,
        name: user.church.name,
        slug: user.church.slug,
      },
      subscription,
    });
  }

  private async applyProfileChanges<T extends PlatformUser | ChurchUser>(
    user: T,
    body: any,
    ensureAvailability: (
      email: string,
      username: string | null,
      phone: string | null,
    ) => Promise<void>,
  ) {
    const name =
      body.name !== undefined
        ? this.normalizeRequiredValue(body.name, 'Name')
        : user.name;
    const email =
      body.email !== undefined ? this.normalizeEmail(body.email) : user.email;
    const username =
      body.username !== undefined
        ? this.normalizeOptionalValue(body.username)
        : user.username;
    const phone =
      body.phone !== undefined
        ? this.normalizeOptionalValue(body.phone)
        : user.phone;

    await ensureAvailability(email, username, phone);

    user.name = name;
    user.email = email;
    user.username = username;
    user.phone = phone;

    if (
      body.password !== undefined &&
      body.password !== null &&
      body.password !== ''
    ) {
      const nextPassword = `${body.password}`.trim();
      if (nextPassword.length < 6) {
        throw new BadRequestException(
          'Password must be at least 6 characters long',
        );
      }
      user.passwordHash = await bcrypt.hash(nextPassword, 10);
    }

    return user;
  }

  private async ensurePlatformIdentityIsAvailable(
    currentUserId: string,
    email: string,
    username: string | null,
    phone: string | null,
  ) {
    const emailMatch = await this.platformUserRepo.findOne({
      where: { email },
    });
    if (emailMatch && emailMatch.id !== currentUserId) {
      throw new ConflictException('Email address is already in use');
    }

    if (username) {
      const usernameMatch = await this.platformUserRepo.findOne({
        where: { username },
      });
      if (usernameMatch && usernameMatch.id !== currentUserId) {
        throw new ConflictException('Username is already in use');
      }
    }

    if (phone) {
      const phoneMatch = await this.platformUserRepo.findOne({
        where: { phone },
      });
      if (phoneMatch && phoneMatch.id !== currentUserId) {
        throw new ConflictException('Phone number is already in use');
      }
    }
  }

  private async ensureChurchIdentityIsAvailable(
    currentUserId: string,
    email: string,
    username: string | null,
    phone: string | null,
  ) {
    const emailMatch = await this.churchUserRepo.findOne({ where: { email } });
    if (emailMatch && emailMatch.id !== currentUserId) {
      throw new ConflictException('Email address is already in use');
    }

    if (username) {
      const usernameMatch = await this.churchUserRepo.findOne({
        where: { username },
      });
      if (usernameMatch && usernameMatch.id !== currentUserId) {
        throw new ConflictException('Username is already in use');
      }
    }

    if (phone) {
      const phoneMatch = await this.churchUserRepo.findOne({
        where: { phone },
      });
      if (phoneMatch && phoneMatch.id !== currentUserId) {
        throw new ConflictException('Phone number is already in use');
      }
    }
  }

  private normalizeRequiredValue(value: unknown, fieldName: string) {
    const normalized = this.normalizeTextValue(value, fieldName);
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return normalized;
  }

  private normalizeOptionalValue(value: unknown) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = this.normalizeTextValue(value, 'Field');
    return normalized || null;
  }

  private normalizeEmail(value: unknown) {
    const normalized = this.normalizeRequiredValue(
      value,
      'Email',
    ).toLowerCase();
    if (!normalized.includes('@')) {
      throw new BadRequestException('A valid email address is required');
    }
    return normalized;
  }

  private normalizeTextValue(value: unknown, fieldName: string) {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number') {
      return `${value}`.trim();
    }

    throw new BadRequestException(`${fieldName} must be a text value`);
  }

  private normalizeIdentifier(value: unknown) {
    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number') {
      return `${value}`.trim();
    }

    return '';
  }
}
