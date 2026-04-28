import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SmsService } from './sms.service';

@Controller('sms')
export class SmsDlrController {
  constructor(private readonly smsService: SmsService) {}

  @Post('advanta/dlr')
  @HttpCode(200)
  handleAdvantaDlr(@Body() body: any) {
    return this.smsService.handleAdvantaDlr(body);
  }
}
