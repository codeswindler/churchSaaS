import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.ensureChurchCredentialColumns();
    await this.ensureClientEnquiryTable();
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

  private async ensureClientEnquiryTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const table = await queryRunner.getTable('client_enquiries');

      if (!table) {
        await queryRunner.query(`
          CREATE TABLE \`client_enquiries\` (
            \`id\` varchar(36) NOT NULL,
            \`organizationName\` varchar(180) NOT NULL,
            \`contactName\` varchar(160) NOT NULL,
            \`email\` varchar(180) NOT NULL,
            \`phone\` varchar(40) NULL,
            \`message\` text NOT NULL,
            \`status\` varchar(40) NOT NULL DEFAULT 'new',
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created client enquiries table.');
        return;
      }

      const statements: string[] = [];

      if (!table.findColumnByName('organizationName')) {
        statements.push(
          'ADD COLUMN `organizationName` varchar(180) NOT NULL AFTER `id`',
        );
      }
      if (!table.findColumnByName('contactName')) {
        statements.push(
          'ADD COLUMN `contactName` varchar(160) NOT NULL AFTER `organizationName`',
        );
      }
      if (!table.findColumnByName('email')) {
        statements.push(
          'ADD COLUMN `email` varchar(180) NOT NULL AFTER `contactName`',
        );
      }
      if (!table.findColumnByName('phone')) {
        statements.push('ADD COLUMN `phone` varchar(40) NULL AFTER `email`');
      }
      if (!table.findColumnByName('message')) {
        statements.push('ADD COLUMN `message` text NOT NULL AFTER `phone`');
      }
      if (!table.findColumnByName('status')) {
        statements.push(
          "ADD COLUMN `status` varchar(40) NOT NULL DEFAULT 'new' AFTER `message`",
        );
      }
      if (!table.findColumnByName('createdAt')) {
        statements.push(
          'ADD COLUMN `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER `status`',
        );
      }
      if (!table.findColumnByName('updatedAt')) {
        statements.push(
          'ADD COLUMN `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) AFTER `createdAt`',
        );
      }

      if (statements.length === 0) {
        return;
      }

      await queryRunner.query(
        `ALTER TABLE \`client_enquiries\` ${statements.join(', ')}`,
      );
      this.logger.log(
        `Applied client enquiry schema bootstrap with ${statements.length} column updates.`,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
