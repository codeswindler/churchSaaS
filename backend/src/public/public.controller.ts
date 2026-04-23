import {
  BadRequestException,
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
import { ClientEnquiry } from '../entities/client-enquiry.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Controller('public')
export class PublicController {
  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    @InjectRepository(ClientEnquiry)
    private readonly clientEnquiryRepo: Repository<ClientEnquiry>,
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
    const acceptingContributions = subscription.status !== 'suspended';

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
      paymentInstructions: {
        channel: 'mpesa',
        shortcode: church.mpesaShortcode || null,
        referenceHint:
          'Pay using the church M-Pesa account, then submit the receipt/reference here.',
      },
    };
  }

  @Post('churches/:slug/contributions/mpesa')
  createPublicContribution(@Param('slug') slug: string, @Body() body: any) {
    return this.contributionsService.createPublicMpesaContribution(slug, body);
  }

  @Post('enquiries')
  async createPublicEnquiry(@Body() body: any) {
    const organizationName = this.normalizeRequiredText(
      body.organizationName || body.churchName,
      'Organization name is required',
    );
    const contactName = this.normalizeRequiredText(
      body.contactName,
      'Contact name is required',
    );
    const email = this.normalizeEmail(body.email);
    const phone = this.normalizeOptionalText(body.phone);
    const message = this.normalizeRequiredText(
      body.message,
      'Enquiry message is required',
    );

    const enquiry = await this.clientEnquiryRepo.save(
      this.clientEnquiryRepo.create({
        organizationName,
        contactName,
        email,
        phone,
        message,
        status: 'new',
      }),
    );

    return {
      id: enquiry.id,
      status: enquiry.status,
      submittedAt: enquiry.createdAt,
    };
  }

  private normalizeOptionalText(value: unknown) {
    if (value === undefined || value === null) {
      return null;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return `${value}`.trim() || null;
    }

    throw new BadRequestException('Invalid text value');
  }

  private normalizeRequiredText(value: unknown, message: string) {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private normalizeEmail(value: unknown) {
    const normalized = this.normalizeRequiredText(
      value,
      'Contact email is required',
    ).toLowerCase();

    if (!normalized.includes('@')) {
      throw new BadRequestException('A valid contact email is required');
    }

    return normalized;
  }
}
