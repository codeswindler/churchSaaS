import { Module } from '@nestjs/common';
import { MpesaService } from './mpesa.service';

@Module({
  providers: [MpesaService],
  exports: [MpesaService],
})
export class PaymentsModule {}
