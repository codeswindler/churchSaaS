import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildChurchIntegrationSummary } from '../common/church.utils';
import { ContributionsService } from '../contributions/contributions.service';
import { Church, ChurchStatus } from '../entities/church.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Controller('public')
export class PublicController {
  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly contributionsService: ContributionsService,
  ) {}

  @Get('churches/:slug/config')
  async getChurchConfig(@Param('slug') slug: string) {
    const church = await this.churchRepo.findOne({ where: { slug } });
    if (!church || church.status !== ChurchStatus.ACTIVE) {
      throw new NotFoundException('Church not found');
    }

    const subscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        church.id,
      );

    const fundAccounts =
      subscription.status === 'suspended'
        ? []
        : await this.fundAccountRepo.find({
            where: { churchId: church.id, isActive: true },
            order: { displayOrder: 'ASC', createdAt: 'ASC' },
          });
    const integrations = buildChurchIntegrationSummary(church);
    const acceptingContributions =
      subscription.status !== 'suspended' && integrations.mpesaConfigured;

    return {
      church: {
        id: church.id,
        name: church.name,
        slug: church.slug,
        logoUrl: church.logoUrl,
      },
      subscription,
      integrations,
      acceptingContributions,
      fundAccounts: acceptingContributions ? fundAccounts : [],
    };
  }

  @Post('churches/:slug/contributions/mpesa')
  createPublicContribution(@Param('slug') slug: string, @Body() body: any) {
    return this.contributionsService.createPublicMpesaContribution(slug, body);
  }
}
