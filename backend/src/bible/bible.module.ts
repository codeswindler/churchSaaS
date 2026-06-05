import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BibleController } from './bible.controller';
import { BibleService } from './bible.service';

@Module({
  imports: [ConfigModule],
  controllers: [BibleController],
  providers: [BibleService],
})
export class BibleModule {}
