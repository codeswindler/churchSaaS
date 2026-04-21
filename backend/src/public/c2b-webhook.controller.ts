import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ContributionsService } from '../contributions/contributions.service';

@Controller('c2b')
export class C2BWebhookController {
  private readonly logger = new Logger(C2BWebhookController.name);

  constructor(private readonly contributionsService: ContributionsService) {}

  @Post('validation')
  @HttpCode(200)
  async handleValidation(@Body() body: any) {
    try {
      return await this.contributionsService.handleMpesaC2BValidation(body);
    } catch (error) {
      this.logCallbackFailure('validation', body, error);
      return { ResultCode: 1, ResultDesc: 'Rejected - validation error' };
    }
  }

  @Post('confirmation')
  @HttpCode(200)
  async handleConfirmation(@Body() body: any) {
    try {
      return await this.contributionsService.handleMpesaC2BConfirmation(body);
    } catch (error) {
      this.logCallbackFailure('confirmation', body, error);
      return { ResultCode: 0, ResultDesc: 'Accepted - diagnostic logged' };
    }
  }

  private logCallbackFailure(
    type: 'validation' | 'confirmation',
    body: any,
    error: any,
  ) {
    this.logger.error(
      `C2B ${type} callback failed: ${error?.message || error}`,
      error?.stack,
    );
    this.logger.error(`C2B ${type} payload: ${this.safeStringify(body)}`);
  }

  private safeStringify(value: any) {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '[unserializable payload]';
    }
  }
}
