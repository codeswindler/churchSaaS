import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { sanitizeChurchForTenant } from '../common/church.utils';
import { ContributionsService } from '../contributions/contributions.service';
import { Church } from '../entities/church.entity';
import { ChurchUser, ChurchUserRole } from '../entities/church-user.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Injectable()
export class ChurchService {
  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly contributionsService: ContributionsService,
  ) {}

  async getDashboard(churchId: string, query: any = {}) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    const [subscription, reportSummary, fundAccounts] = await Promise.all([
      this.churchSubscriptionsService.getChurchSubscriptionStatus(churchId),
      this.contributionsService.getChurchReportSummary(churchId, query),
      this.listFundAccounts(churchId),
    ]);

    return {
      church: sanitizeChurchForTenant(church),
      subscription,
      reportSummary,
      activeFundAccounts: fundAccounts.filter((item) => item.isActive).length,
    };
  }

  async getSubscriptionStatus(churchId: string) {
    return this.churchSubscriptionsService.getChurchSubscriptionStatus(
      churchId,
    );
  }

  async listFundAccounts(churchId: string) {
    return this.fundAccountRepo.find({
      where: { churchId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createFundAccount(churchId: string, body: any) {
    if (!body.name) {
      throw new BadRequestException('Fund account name is required');
    }

    const code = this.slugify(body.code || body.name);
    const existing = await this.fundAccountRepo.findOne({
      where: { churchId, code },
    });
    if (existing) {
      throw new BadRequestException('Fund account code already exists');
    }

    const fundAccount = this.fundAccountRepo.create({
      churchId,
      name: body.name,
      code,
      description: body.description || null,
      isActive: body.isActive ?? true,
      displayOrder: Number(body.displayOrder || 0),
      receiptTemplate:
        body.receiptTemplate ||
        'Dear {name}, we confirm receipt of KES {amount} towards {account} on {date}. Ref: {reference}. Thank you for supporting the ministry.',
    });

    return this.fundAccountRepo.save(fundAccount);
  }

  async updateFundAccount(churchId: string, fundAccountId: string, body: any) {
    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: fundAccountId, churchId },
    });
    if (!fundAccount) {
      throw new NotFoundException('Fund account not found');
    }

    if (body.code && body.code !== fundAccount.code) {
      const code = this.slugify(body.code);
      const existing = await this.fundAccountRepo.findOne({
        where: { churchId, code },
      });
      if (existing && existing.id !== fundAccount.id) {
        throw new BadRequestException('Fund account code already exists');
      }
      fundAccount.code = code;
    }

    fundAccount.name = body.name ?? fundAccount.name;
    fundAccount.description = body.description ?? fundAccount.description;
    fundAccount.isActive = body.isActive ?? fundAccount.isActive;
    fundAccount.displayOrder = Number(
      body.displayOrder ?? fundAccount.displayOrder,
    );
    fundAccount.receiptTemplate =
      body.receiptTemplate ?? fundAccount.receiptTemplate;

    return this.fundAccountRepo.save(fundAccount);
  }

  async listChurchUsers(churchId: string) {
    const users = await this.churchUserRepo.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash, ...user }) => user);
  }

  async createChurchUser(churchId: string, body: any) {
    if (!body.name || !body.email || !body.password || !body.role) {
      throw new BadRequestException(
        'Name, email, password, and role are required',
      );
    }

    const existing = await this.churchUserRepo.findOne({
      where: [
        { email: body.email.toLowerCase() },
        { username: body.username || '' },
        { phone: body.phone || '' },
      ],
    });
    if (existing) {
      throw new BadRequestException('Church user already exists');
    }

    const user = this.churchUserRepo.create({
      churchId,
      name: body.name,
      email: body.email.toLowerCase(),
      username: body.username || null,
      phone: body.phone || null,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: body.role as ChurchUserRole,
      isActive: body.isActive ?? true,
    });

    const saved = await this.churchUserRepo.save(user);
    const { passwordHash, ...result } = saved;
    return result;
  }

  async updateChurchUser(churchId: string, userId: string, body: any) {
    const user = await this.churchUserRepo.findOne({
      where: { id: userId, churchId },
    });
    if (!user) {
      throw new NotFoundException('Church user not found');
    }

    if (body.email && body.email.toLowerCase() !== user.email) {
      const existing = await this.churchUserRepo.findOne({
        where: { email: body.email.toLowerCase() },
      });
      if (existing && existing.id !== user.id) {
        throw new BadRequestException('Email already in use');
      }
      user.email = body.email.toLowerCase();
    }

    if (body.username && body.username !== user.username) {
      const existing = await this.churchUserRepo.findOne({
        where: { username: body.username },
      });
      if (existing && existing.id !== user.id) {
        throw new BadRequestException('Username already in use');
      }
      user.username = body.username;
    } else if (body.username === '') {
      user.username = null;
    }

    if (body.phone && body.phone !== user.phone) {
      const existing = await this.churchUserRepo.findOne({
        where: { phone: body.phone },
      });
      if (existing && existing.id !== user.id) {
        throw new BadRequestException('Phone already in use');
      }
      user.phone = body.phone;
    } else if (body.phone === '') {
      user.phone = null;
    }

    user.name = body.name ?? user.name;
    user.role = body.role ?? user.role;
    user.isActive = body.isActive ?? user.isActive;

    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 10);
    }

    const saved = await this.churchUserRepo.save(user);
    const { passwordHash, ...result } = saved;
    return result;
  }

  async listContributions(churchId: string, query: any) {
    return this.contributionsService.listChurchContributions(churchId, query);
  }

  async createManualContribution(churchId: string, userId: string, body: any) {
    return this.contributionsService.createManualContribution(
      churchId,
      userId,
      body,
    );
  }

  async getReportSummary(churchId: string, query: any) {
    return this.contributionsService.getChurchReportSummary(churchId, query);
  }

  private slugify(value: string) {
    return `${value || ''}`
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
