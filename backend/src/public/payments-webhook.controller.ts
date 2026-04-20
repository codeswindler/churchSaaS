import { Body, Controller, Post } from '@nestjs/common';
import { ContributionsService } from '../contributions/contributions.service';

@Controller('payments/mpesa')
export class PaymentsWebhookController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Post('webhook')
  handleWebhook(@Body() body: any) {
    return this.contributionsService.handleMpesaWebhook(body);
  }

  @Post('c2b/validation')
  handleC2BValidation(@Body() body: any) {
    return this.contributionsService.handleMpesaC2BValidation(body);
  }

  @Post('c2b/confirmation')
  handleC2BConfirmation(@Body() body: any) {
    return this.contributionsService.handleMpesaC2BConfirmation(body);
  }
}
