import { Body, Controller, Post } from '@nestjs/common';
import { ContributionsService } from '../contributions/contributions.service';

@Controller('c2b')
export class C2BWebhookController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Post('validation')
  handleValidation(@Body() body: any) {
    return this.contributionsService.handleMpesaC2BValidation(body);
  }

  @Post('confirmation')
  handleConfirmation(@Body() body: any) {
    return this.contributionsService.handleMpesaWebhook(body);
  }
}
