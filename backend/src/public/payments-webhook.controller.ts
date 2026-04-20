import { Body, Controller, Post } from '@nestjs/common';
import { ContributionsService } from '../contributions/contributions.service';

@Controller('payments/mpesa')
export class PaymentsWebhookController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Post('webhook')
  handleWebhook(@Body() body: any) {
    return this.contributionsService.handleMpesaWebhook(body);
  }
}
