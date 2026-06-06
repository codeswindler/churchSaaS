import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ContributionsService } from '../contributions/contributions.service';
import { SmsService } from '../sms/sms.service';

@Controller('payments/mpesa')
export class PaymentsWebhookController {
  constructor(
    private readonly contributionsService: ContributionsService,
    private readonly smsService: SmsService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(@Body() body: any) {
    return this.contributionsService.handleMpesaWebhook(body);
  }

  @Post('sms-units/webhook')
  @HttpCode(200)
  handleSmsUnitsWebhook(@Body() body: any) {
    return this.smsService.handleSmsUnitPurchaseMpesaWebhook(body);
  }

  @Post('c2b/validation')
  @HttpCode(200)
  handleC2BValidation(@Body() body: any) {
    return this.contributionsService.handleMpesaC2BValidation(body);
  }

  @Post('c2b/confirmation')
  @HttpCode(200)
  handleC2BConfirmation(@Body() body: any) {
    return this.contributionsService.handleMpesaC2BConfirmation(body);
  }
}
