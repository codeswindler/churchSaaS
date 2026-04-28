import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.ensureChurchCredentialColumns();
    await this.ensureRevenueAndAccessColumns();
    await this.ensureClientEnquiryTable();
    await this.ensureSmsMessagingTables();
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

  private async ensureRevenueAndAccessColumns() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const churches = await queryRunner.getTable('churches');
      if (churches) {
        const statements: string[] = [];

        if (!churches.findColumnByName('commissionRatePct')) {
          statements.push(
            'ADD COLUMN `commissionRatePct` decimal(5,2) NOT NULL DEFAULT 0 AFTER `mpesaCallbackUrl`',
          );
        }
        if (!churches.findColumnByName('enabledFeatures')) {
          statements.push(
            'ADD COLUMN `enabledFeatures` text NULL AFTER `commissionRatePct`',
          );
        }

        if (statements.length > 0) {
          await queryRunner.query(
            `ALTER TABLE \`churches\` ${statements.join(', ')}`,
          );
          this.logger.log(
            `Applied church revenue/access schema bootstrap with ${statements.length} column updates.`,
          );
        }
      }

      const churchUsers = await queryRunner.getTable('church_users');
      if (churchUsers) {
        const statements: string[] = [
          "MODIFY COLUMN `role` varchar(40) NOT NULL DEFAULT 'treasurer'",
        ];

        if (!churchUsers.findColumnByName('permissionOverrides')) {
          statements.push(
            'ADD COLUMN `permissionOverrides` text NULL AFTER `role`',
          );
        }

        await queryRunner.query(
          `ALTER TABLE \`church_users\` ${statements.join(', ')}`,
        );
        await queryRunner.query(
          "UPDATE `church_users` SET `role` = 'priest' WHERE `role` = 'church_admin'",
        );
        await queryRunner.query(
          "UPDATE `church_users` SET `role` = 'treasurer' WHERE `role` = 'cashier'",
        );
      }

      const contributors = await queryRunner.getTable('contributors');
      if (contributors && !contributors.findColumnByName('gender')) {
        await queryRunner.query(
          'ALTER TABLE `contributors` ADD COLUMN `gender` varchar(20) NULL AFTER `memberNumber`',
        );
      }

      const contributions = await queryRunner.getTable('contributions');
      if (contributions) {
        const statements: string[] = [];

        if (!contributions.findColumnByName('sourceType')) {
          statements.push(
            "ADD COLUMN `sourceType` varchar(40) NOT NULL DEFAULT 'manual_entry' AFTER `status`",
          );
        }
        if (!contributions.findColumnByName('commissionRatePctApplied')) {
          statements.push(
            'ADD COLUMN `commissionRatePctApplied` decimal(5,2) NULL AFTER `sourceType`',
          );
        }
        if (!contributions.findColumnByName('commissionAmount')) {
          statements.push(
            'ADD COLUMN `commissionAmount` decimal(12,2) NULL AFTER `commissionRatePctApplied`',
          );
        }

        if (statements.length > 0) {
          await queryRunner.query(
            `ALTER TABLE \`contributions\` ${statements.join(', ')}`,
          );
          this.logger.log(
            `Applied contribution revenue schema bootstrap with ${statements.length} column updates.`,
          );
        }

        await queryRunner.query(`
          UPDATE \`contributions\` contribution
          JOIN \`churches\` church ON church.\`id\` = contribution.\`churchId\`
          SET
            contribution.\`sourceType\` = 'mpesa_c2b',
            contribution.\`commissionRatePctApplied\` = COALESCE(contribution.\`commissionRatePctApplied\`, church.\`commissionRatePct\`, 0),
            contribution.\`commissionAmount\` = COALESCE(
              contribution.\`commissionAmount\`,
              ROUND((contribution.\`amount\` * COALESCE(church.\`commissionRatePct\`, 0)) / 100, 2)
            )
          WHERE contribution.\`channel\` = 'mpesa'
            AND contribution.\`status\` = 'confirmed'
            AND contribution.\`notes\` LIKE 'M-Pesa C2B confirmation%'
        `);
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureSmsMessagingTables() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const batches = await queryRunner.getTable('sms_batches');
      if (!batches) {
        await queryRunner.query(`
          CREATE TABLE \`sms_batches\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`createdByUserId\` varchar(36) NULL,
            \`audience\` varchar(40) NOT NULL,
            \`messageBody\` text NOT NULL,
            \`recipientCount\` int NOT NULL DEFAULT 0,
            \`totalUnits\` int NOT NULL DEFAULT 0,
            \`status\` varchar(40) NOT NULL DEFAULT 'queued',
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_sms_batches_church_created\` (\`churchId\`, \`createdAt\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created SMS batches table.');
      }

      const outbox = await queryRunner.getTable('sms_outbox');
      if (!outbox) {
        await queryRunner.query(`
          CREATE TABLE \`sms_outbox\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`batchId\` varchar(36) NULL,
            \`contributorId\` varchar(36) NULL,
            \`createdByUserId\` varchar(36) NULL,
            \`recipientName\` varchar(120) NULL,
            \`recipientMobile\` varchar(255) NOT NULL,
            \`isHashedRecipient\` tinyint NOT NULL DEFAULT 0,
            \`messageType\` varchar(40) NOT NULL,
            \`messageBody\` text NOT NULL,
            \`estimatedUnits\` int NOT NULL DEFAULT 1,
            \`sendStatus\` varchar(40) NOT NULL DEFAULT 'pending',
            \`deliveryStatus\` varchar(40) NOT NULL DEFAULT 'pending',
            \`providerMessageId\` varchar(120) NULL,
            \`providerCode\` varchar(40) NULL,
            \`providerDescription\` varchar(255) NULL,
            \`deliveryDescription\` varchar(255) NULL,
            \`deliveryTat\` varchar(80) NULL,
            \`deliveryReportedAt\` datetime NULL,
            \`providerRawResponse\` text NULL,
            \`sentAt\` datetime NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_sms_outbox_church_created\` (\`churchId\`, \`createdAt\`),
            INDEX \`IDX_sms_outbox_provider_message\` (\`providerMessageId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created SMS outbox table.');
      }
    } finally {
      await queryRunner.release();
    }
  }
}
