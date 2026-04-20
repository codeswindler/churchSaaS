import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.ensureChurchCredentialColumns();
  }

  private async ensureChurchCredentialColumns() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const table = await queryRunner.getTable('churches');
      if (!table) {
        this.logger.warn(
          'Table "churches" was not found; skipped church credential bootstrap.',
        );
        return;
      }

      const statements: string[] = [];

      if (!table.findColumnByName('smsPartnerId')) {
        statements.push(
          'ADD COLUMN `smsPartnerId` varchar(120) NULL AFTER `notes`',
        );
      }
      if (!table.findColumnByName('smsApiKey')) {
        statements.push(
          'ADD COLUMN `smsApiKey` text NULL AFTER `smsPartnerId`',
        );
      }
      if (!table.findColumnByName('smsShortcode')) {
        statements.push(
          'ADD COLUMN `smsShortcode` varchar(80) NULL AFTER `smsApiKey`',
        );
      }
      if (!table.findColumnByName('smsBaseUrl')) {
        statements.push(
          'ADD COLUMN `smsBaseUrl` varchar(255) NULL AFTER `smsShortcode`',
        );
      }
      if (!table.findColumnByName('mpesaEnvironment')) {
        statements.push(
          'ADD COLUMN `mpesaEnvironment` varchar(20) NULL AFTER `smsBaseUrl`',
        );
      }
      if (!table.findColumnByName('mpesaConsumerKey')) {
        statements.push(
          'ADD COLUMN `mpesaConsumerKey` varchar(255) NULL AFTER `mpesaEnvironment`',
        );
      }
      if (!table.findColumnByName('mpesaConsumerSecret')) {
        statements.push(
          'ADD COLUMN `mpesaConsumerSecret` varchar(255) NULL AFTER `mpesaConsumerKey`',
        );
      }
      if (!table.findColumnByName('mpesaPasskey')) {
        statements.push(
          'ADD COLUMN `mpesaPasskey` text NULL AFTER `mpesaConsumerSecret`',
        );
      }
      if (!table.findColumnByName('mpesaShortcode')) {
        statements.push(
          'ADD COLUMN `mpesaShortcode` varchar(40) NULL AFTER `mpesaPasskey`',
        );
      }
      if (!table.findColumnByName('mpesaCallbackUrl')) {
        statements.push(
          'ADD COLUMN `mpesaCallbackUrl` varchar(255) NULL AFTER `mpesaShortcode`',
        );
      }

      if (statements.length === 0) {
        return;
      }

      await queryRunner.query(
        `ALTER TABLE \`churches\` ${statements.join(', ')}`,
      );
      this.logger.log(
        `Applied church credential schema bootstrap with ${statements.length} column updates.`,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
