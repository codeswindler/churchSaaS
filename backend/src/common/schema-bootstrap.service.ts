import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.ensureChurchCredentialColumns();
    await this.ensurePlatformSmsConfigTable();
    await this.ensureRevenueAndAccessColumns();
    await this.ensureFundAccountColumns();
    await this.ensureClientEnquiryTable();
    await this.ensureSmsMessagingTables();
    await this.ensureSmsSenderTables();
    await this.ensureMobileDeviceTable();
    await this.ensureMobileB2cWithdrawalTable();
    await this.ensureChurchNotificationTable();
    await this.ensureDiscipleshipTables();
    await this.ensureCongregationPageTable();
    await this.migrateLegacyFundDisplayTargets();
  }

  private async ensureChurchNotificationTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const table = await queryRunner.getTable('church_notifications');
      if (!table) {
        await queryRunner.query(`
          CREATE TABLE \`church_notifications\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`recipientUserId\` varchar(36) NULL,
            \`type\` varchar(80) NOT NULL,
            \`title\` varchar(180) NOT NULL,
            \`body\` text NULL,
            \`entityType\` varchar(80) NULL,
            \`entityId\` varchar(120) NULL,
            \`actionUrl\` varchar(255) NULL,
            \`isRead\` tinyint NOT NULL DEFAULT 0,
            \`readAt\` datetime NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_church_notifications_recipient\` (\`churchId\`, \`recipientUserId\`, \`isRead\`),
            INDEX \`IDX_church_notifications_entity\` (\`churchId\`, \`entityType\`, \`entityId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created church notifications table.');
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureSmsSenderTables() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const senders = await queryRunner.getTable('sms_senders');
      if (!senders) {
        await queryRunner.query(`
          CREATE TABLE \`sms_senders\` (
            \`id\` varchar(36) NOT NULL,
            \`name\` varchar(80) NOT NULL,
            \`isActive\` tinyint NOT NULL DEFAULT 1,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_sms_senders_name\` (\`name\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created SMS senders table.');
      }

      const allocations = await queryRunner.getTable('church_sms_senders');
      if (!allocations) {
        await queryRunner.query(`
          CREATE TABLE \`church_sms_senders\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`senderId\` varchar(36) NOT NULL,
            \`isDefault\` tinyint NOT NULL DEFAULT 0,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_church_sms_sender\` (\`churchId\`, \`senderId\`),
            INDEX \`IDX_church_sms_senders_church\` (\`churchId\`),
            INDEX \`IDX_church_sms_senders_sender\` (\`senderId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created church SMS sender allocations table.');
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureMobileDeviceTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const table = await queryRunner.getTable('mobile_devices');
      if (!table) {
        await queryRunner.query(`
          CREATE TABLE \`mobile_devices\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`churchUserId\` varchar(36) NOT NULL,
            \`fcmToken\` varchar(512) NOT NULL,
            \`platform\` varchar(40) NOT NULL DEFAULT 'android',
            \`appVersion\` varchar(80) NULL,
            \`deviceName\` varchar(160) NULL,
            \`isActive\` tinyint NOT NULL DEFAULT 1,
            \`lastSeenAt\` datetime NULL,
            \`deactivatedAt\` datetime NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_mobile_devices_fcm_token\` (\`fcmToken\`),
            INDEX \`IDX_mobile_devices_church_user_active\` (\`churchId\`, \`churchUserId\`, \`isActive\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created mobile devices table.');
        return;
      }

      const statements: string[] = [];
      if (!table.findColumnByName('appVersion')) {
        statements.push(
          'ADD COLUMN `appVersion` varchar(80) NULL AFTER `platform`',
        );
      }
      if (!table.findColumnByName('deviceName')) {
        statements.push(
          'ADD COLUMN `deviceName` varchar(160) NULL AFTER `appVersion`',
        );
      }
      if (!table.findColumnByName('lastSeenAt')) {
        statements.push(
          'ADD COLUMN `lastSeenAt` datetime NULL AFTER `isActive`',
        );
      }
      if (!table.findColumnByName('deactivatedAt')) {
        statements.push(
          'ADD COLUMN `deactivatedAt` datetime NULL AFTER `lastSeenAt`',
        );
      }

      if (statements.length > 0) {
        await queryRunner.query(
          `ALTER TABLE \`mobile_devices\` ${statements.join(', ')}`,
        );
        this.logger.log(
          `Applied mobile device schema bootstrap with ${statements.length} column updates.`,
        );
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureMobileB2cWithdrawalTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const table = await queryRunner.getTable('mobile_b2c_withdrawals');
      if (!table) {
        await queryRunner.query(`
          CREATE TABLE \`mobile_b2c_withdrawals\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`requestedByUserId\` varchar(36) NULL,
            \`fundAccountId\` varchar(36) NULL,
            \`phoneNumber\` varchar(20) NOT NULL,
            \`amount\` decimal(12,2) NOT NULL,
            \`recipientName\` varchar(180) NULL,
            \`remarks\` varchar(255) NOT NULL,
            \`occasion\` varchar(120) NULL,
            \`status\` varchar(40) NOT NULL DEFAULT 'created',
            \`resultCode\` varchar(80) NULL,
            \`resultDesc\` text NULL,
            \`originatorConversationId\` varchar(120) NULL,
            \`conversationId\` varchar(120) NULL,
            \`transactionId\` varchar(120) NULL,
            \`completedAt\` timestamp NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_mobile_b2c_church_created\` (\`churchId\`, \`createdAt\`),
            INDEX \`IDX_mobile_b2c_church_status_created\` (\`churchId\`, \`status\`, \`createdAt\`),
            INDEX \`IDX_mobile_b2c_originator\` (\`originatorConversationId\`),
            INDEX \`IDX_mobile_b2c_conversation\` (\`conversationId\`),
            INDEX \`IDX_mobile_b2c_requested_by\` (\`requestedByUserId\`),
            INDEX \`IDX_mobile_b2c_fund\` (\`fundAccountId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created mobile B2C withdrawals table.');
      }
    } finally {
      await queryRunner.release();
    }
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
      if (!table.findColumnByName('smsShortcodes')) {
        statements.push(
          'ADD COLUMN `smsShortcodes` text NULL AFTER `smsShortcode`',
        );
      }
      if (!table.findColumnByName('smsBaseUrl')) {
        statements.push(
          'ADD COLUMN `smsBaseUrl` varchar(255) NULL AFTER `smsShortcodes`',
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
      if (!table.findColumnByName('mpesaB2cConsumerKey')) {
        statements.push(
          'ADD COLUMN `mpesaB2cConsumerKey` varchar(255) NULL AFTER `mpesaCallbackUrl`',
        );
      }
      if (!table.findColumnByName('mpesaB2cConsumerSecret')) {
        statements.push(
          'ADD COLUMN `mpesaB2cConsumerSecret` varchar(255) NULL AFTER `mpesaB2cConsumerKey`',
        );
      }
      if (!table.findColumnByName('mpesaB2cShortcode')) {
        statements.push(
          'ADD COLUMN `mpesaB2cShortcode` varchar(40) NULL AFTER `mpesaB2cConsumerSecret`',
        );
      }
      if (!table.findColumnByName('mpesaB2cInitiatorName')) {
        statements.push(
          'ADD COLUMN `mpesaB2cInitiatorName` varchar(120) NULL AFTER `mpesaB2cShortcode`',
        );
      }
      if (!table.findColumnByName('mpesaB2cSecurityCredential')) {
        statements.push(
          'ADD COLUMN `mpesaB2cSecurityCredential` text NULL AFTER `mpesaB2cInitiatorName`',
        );
      }
      if (!table.findColumnByName('mpesaB2cCommandId')) {
        statements.push(
          'ADD COLUMN `mpesaB2cCommandId` varchar(60) NULL AFTER `mpesaB2cSecurityCredential`',
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
        if (!churches.findColumnByName('billingModel')) {
          statements.push(
            "ADD COLUMN `billingModel` varchar(40) NOT NULL DEFAULT 'subscription' AFTER `commissionRatePct`",
          );
        }
        if (!churches.findColumnByName('enabledFeatures')) {
          statements.push(
            'ADD COLUMN `enabledFeatures` text NULL AFTER `billingModel`',
          );
        }
        if (!churches.findColumnByName('smsUnitRateKes')) {
          statements.push(
            'ADD COLUMN `smsUnitRateKes` decimal(10,2) NOT NULL DEFAULT 0 AFTER `smsBaseUrl`',
          );
        }

        if (statements.length > 0) {
          await queryRunner.query(
            `ALTER TABLE \`churches\` ${statements.join(', ')}`,
          );
          await queryRunner.query(
            "UPDATE `churches` SET `billingModel` = 'commission' WHERE COALESCE(`commissionRatePct`, 0) > 0",
          );
          this.logger.log(
            `Applied church revenue/access schema bootstrap with ${statements.length} column updates.`,
          );
        }
      }

      const churchUsers = await queryRunner.getTable('church_users');
      if (churchUsers) {
        const statements: string[] = [
          "MODIFY COLUMN `role` varchar(40) NOT NULL DEFAULT 'user'",
        ];

        if (!churchUsers.findColumnByName('permissionOverrides')) {
          statements.push(
            'ADD COLUMN `permissionOverrides` text NULL AFTER `role`',
          );
        }
        if (!churchUsers.findColumnByName('permissionDenials')) {
          statements.push(
            'ADD COLUMN `permissionDenials` text NULL AFTER `permissionOverrides`',
          );
        }

        await queryRunner.query(
          `ALTER TABLE \`church_users\` ${statements.join(', ')}`,
        );
        await queryRunner.query(
          "UPDATE `church_users` SET `role` = 'priest' WHERE `role` = 'church_admin'",
        );
        await queryRunner.query(
          "UPDATE `church_users` SET `role` = 'user' WHERE `role` IN ('admin', 'treasurer', 'secretary', 'media', 'cashier') OR `role` IS NULL OR TRIM(`role`) = ''",
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
        if (!contributions.findColumnByName('payerName')) {
          statements.push(
            'ADD COLUMN `payerName` varchar(180) NULL AFTER `paymentReference`',
          );
        }
        if (!contributions.findColumnByName('providerPayerId')) {
          statements.push(
            'ADD COLUMN `providerPayerId` varchar(180) NULL AFTER `payerName`',
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
              CEILING((contribution.\`amount\` * COALESCE(church.\`commissionRatePct\`, 0)) / 100)
            )
          WHERE contribution.\`channel\` = 'mpesa'
            AND contribution.\`status\` = 'confirmed'
            AND contribution.\`notes\` LIKE 'M-Pesa C2B confirmation%'
        `);
        await queryRunner.query(`
          UPDATE \`contributions\`
          SET \`commissionAmount\` = CEILING(\`commissionAmount\`)
          WHERE \`commissionAmount\` IS NOT NULL
            AND \`commissionAmount\` > 0
            AND \`commissionAmount\` <> CEILING(\`commissionAmount\`)
        `);
        await queryRunner.query(`
          UPDATE \`contributions\` contribution
          JOIN \`contributors\` contributor ON contributor.\`id\` = contribution.\`contributorId\`
          SET contribution.\`payerName\` = contributor.\`name\`
          WHERE contribution.\`payerName\` IS NULL
            AND contributor.\`name\` IS NOT NULL
            AND TRIM(contributor.\`name\`) <> ''
        `);
        await queryRunner.query(`
          UPDATE \`contributions\`
          SET \`providerPayerId\` = \`providerRequestId\`
          WHERE \`providerPayerId\` IS NULL
            AND \`providerRequestId\` IS NOT NULL
            AND \`notes\` LIKE 'M-Pesa C2B confirmation%'
        `);
        if (
          !contributions.indices.some(
            (index) => index.name === 'IDX_contributions_church_status_date',
          )
        ) {
          await queryRunner.query(
            'CREATE INDEX `IDX_contributions_church_status_date` ON `contributions` (`churchId`, `status`, `receivedAt`)',
          );
        }
        if (
          !contributions.indices.some(
            (index) =>
              index.name === 'IDX_contributions_church_fund_status_date',
          )
        ) {
          await queryRunner.query(
            'CREATE INDEX `IDX_contributions_church_fund_status_date` ON `contributions` (`churchId`, `fundAccountId`, `status`, `receivedAt`)',
          );
        }
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureFundAccountColumns() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const fundAccounts = await queryRunner.getTable('fund_accounts');
      if (!fundAccounts) {
        return;
      }

      const statements: string[] = [];
      if (!fundAccounts.findColumnByName('archivedAt')) {
        statements.push(
          'ADD COLUMN `archivedAt` datetime NULL AFTER `isActive`',
        );
      }
      if (!fundAccounts.findColumnByName('archivedByUserId')) {
        statements.push(
          'ADD COLUMN `archivedByUserId` varchar(36) NULL AFTER `archivedAt`',
        );
      }
      if (!fundAccounts.findColumnByName('archiveReason')) {
        statements.push(
          'ADD COLUMN `archiveReason` varchar(255) NULL AFTER `archivedByUserId`',
        );
      }
      if (!fundAccounts.findColumnByName('targetAmount')) {
        statements.push(
          'ADD COLUMN `targetAmount` decimal(14,2) NULL AFTER `displayOrder`',
        );
      }

      if (statements.length === 0) {
        return;
      }

      await queryRunner.query(
        `ALTER TABLE \`fund_accounts\` ${statements.join(', ')}`,
      );
      this.logger.log('Ensured fund account archive and public target columns.');
    } finally {
      await queryRunner.release();
    }
  }

  private async migrateLegacyFundDisplayTargets() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const fundAccounts = await queryRunner.getTable('fund_accounts');
      const congregationPages = await queryRunner.getTable(
        'church_congregation_pages',
      );
      if (
        !fundAccounts?.findColumnByName('targetAmount') ||
        !congregationPages?.findColumnByName('fundDisplays')
      ) {
        return;
      }

      const pages = await queryRunner.query(`
        SELECT \`churchId\`, \`fundDisplays\`
        FROM \`church_congregation_pages\`
        WHERE \`fundDisplays\` IS NOT NULL
          AND TRIM(\`fundDisplays\`) <> ''
      `);
      let candidates = 0;

      for (const page of pages) {
        let displays: any[] = [];
        try {
          displays = Array.isArray(page.fundDisplays)
            ? page.fundDisplays
            : JSON.parse(page.fundDisplays);
        } catch (_error) {
          continue;
        }
        if (!Array.isArray(displays)) {
          continue;
        }

        const targetByFundAccount = new Map<
          string,
          { amount: number; priority: number; updatedAt: number }
        >();
        displays.forEach((display: any) => {
          const fundAccountId = `${display?.fundAccountId || ''}`.trim();
          const amount = Number(display?.targetAmount || 0);
          if (!fundAccountId || !Number.isFinite(amount) || amount <= 0) {
            return;
          }

          const approvalStatus = `${display?.approvalStatus || 'approved'}`
            .trim()
            .toLowerCase();
          const priority =
            display?.isActive !== false && approvalStatus === 'approved'
              ? 1
              : 0;
          const updatedAt = new Date(
            display?.updatedAt ||
              display?.createdAt ||
              display?.visibleFrom ||
              display?.startDate ||
              0,
          ).getTime();
          const candidate = {
            amount: Number(amount.toFixed(2)),
            priority,
            updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
          };
          const previous = targetByFundAccount.get(fundAccountId);
          if (
            !previous ||
            candidate.priority > previous.priority ||
            (candidate.priority === previous.priority &&
              candidate.updatedAt >= previous.updatedAt)
          ) {
            targetByFundAccount.set(fundAccountId, candidate);
          }
        });

        for (const [fundAccountId, target] of targetByFundAccount) {
          await queryRunner.query(
            `
              UPDATE \`fund_accounts\`
              SET \`targetAmount\` = ?
              WHERE \`id\` = ?
                AND \`churchId\` = ?
                AND (\`targetAmount\` IS NULL OR \`targetAmount\` <= 0)
            `,
            [target.amount, fundAccountId, page.churchId],
          );
          candidates += 1;
        }
      }

      if (candidates > 0) {
        this.logger.log(
          `Checked ${candidates} legacy fund display target candidates for backfill.`,
        );
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensurePlatformSmsConfigTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const table = await queryRunner.getTable('platform_sms_config');

      if (!table) {
        await queryRunner.query(`
          CREATE TABLE \`platform_sms_config\` (
            \`id\` varchar(40) NOT NULL,
            \`smsPartnerId\` varchar(120) NULL,
            \`smsApiKey\` text NULL,
            \`smsShortcode\` varchar(80) NULL,
            \`smsBaseUrl\` varchar(255) NULL,
            \`mpesaEnvironment\` varchar(20) NULL,
            \`mpesaConsumerKey\` varchar(255) NULL,
            \`mpesaConsumerSecret\` varchar(255) NULL,
            \`mpesaPasskey\` text NULL,
            \`mpesaShortcode\` varchar(40) NULL,
            \`mpesaCallbackUrl\` varchar(255) NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created platform SMS config table.');
        return;
      }

      const statements: string[] = [];
      if (!table.findColumnByName('smsPartnerId')) {
        statements.push(
          'ADD COLUMN `smsPartnerId` varchar(120) NULL AFTER `id`',
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
      if (!table.findColumnByName('createdAt')) {
        statements.push(
          'ADD COLUMN `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER `mpesaCallbackUrl`',
        );
      }
      if (!table.findColumnByName('updatedAt')) {
        statements.push(
          'ADD COLUMN `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) AFTER `createdAt`',
        );
      }

      if (statements.length > 0) {
        await queryRunner.query(
          `ALTER TABLE \`platform_sms_config\` ${statements.join(', ')}`,
        );
        this.logger.log(
          `Applied platform SMS config schema bootstrap with ${statements.length} column updates.`,
        );
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

      const addressBooks = await queryRunner.getTable('sms_address_books');
      if (!addressBooks) {
        await queryRunner.query(`
          CREATE TABLE \`sms_address_books\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`createdByUserId\` varchar(36) NULL,
            \`name\` varchar(160) NOT NULL,
            \`description\` text NULL,
            \`isActive\` tinyint NOT NULL DEFAULT 1,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_sms_address_books_church_name\` (\`churchId\`, \`name\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created SMS address books table.');
      }

      const addressBookContacts = await queryRunner.getTable(
        'sms_address_book_contacts',
      );
      if (!addressBookContacts) {
        await queryRunner.query(`
          CREATE TABLE \`sms_address_book_contacts\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`addressBookId\` varchar(36) NOT NULL,
            \`firstName\` varchar(120) NULL,
            \`lastName\` varchar(120) NULL,
            \`displayName\` varchar(180) NULL,
            \`gender\` varchar(20) NULL,
            \`normalizedPhone\` varchar(40) NOT NULL,
            \`sourceLabel\` varchar(80) NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_sms_address_book_contact_phone\` (\`addressBookId\`, \`normalizedPhone\`),
            INDEX \`IDX_sms_address_book_contacts_church_phone\` (\`churchId\`, \`normalizedPhone\`),
            INDEX \`IDX_sms_address_book_contacts_book_phone\` (\`addressBookId\`, \`normalizedPhone\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created SMS address book contacts table.');
      } else if (!addressBookContacts.findColumnByName('gender')) {
        await queryRunner.query(
          'ALTER TABLE `sms_address_book_contacts` ADD COLUMN `gender` varchar(20) NULL AFTER `displayName`',
        );
        this.logger.log('Added gender column to SMS address book contacts.');
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
            INDEX \`IDX_sms_outbox_church_contributor_created\` (\`churchId\`, \`contributorId\`, \`createdAt\`),
            INDEX \`IDX_sms_outbox_church_mobile_created\` (\`churchId\`, \`recipientMobile\`, \`createdAt\`),
            INDEX \`IDX_sms_outbox_provider_message\` (\`providerMessageId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created SMS outbox table.');
      }
      const currentOutbox = await queryRunner.getTable('sms_outbox');
      if (
        currentOutbox &&
        !currentOutbox.indices.some(
          (index) => index.name === 'IDX_sms_outbox_church_contributor_created',
        )
      ) {
        await queryRunner.query(
          'CREATE INDEX `IDX_sms_outbox_church_contributor_created` ON `sms_outbox` (`churchId`, `contributorId`, `createdAt`)',
        );
      }
      if (
        currentOutbox &&
        !currentOutbox.indices.some(
          (index) => index.name === 'IDX_sms_outbox_church_mobile_created',
        )
      ) {
        await queryRunner.query(
          'CREATE INDEX `IDX_sms_outbox_church_mobile_created` ON `sms_outbox` (`churchId`, `recipientMobile`, `createdAt`)',
        );
      }

      const purchases = await queryRunner.getTable('sms_unit_purchases');
      if (!purchases) {
        await queryRunner.query(`
          CREATE TABLE \`sms_unit_purchases\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`createdByUserId\` varchar(36) NULL,
            \`batchId\` varchar(36) NULL,
            \`messagePayload\` text NOT NULL,
            \`quoteSnapshot\` text NOT NULL,
            \`recipientCount\` int NOT NULL DEFAULT 0,
            \`totalUnits\` int NOT NULL DEFAULT 0,
            \`smsUnitRateKes\` decimal(10,2) NOT NULL DEFAULT 0,
            \`amountKes\` decimal(12,2) NOT NULL DEFAULT 0,
            \`payerPhone\` varchar(30) NOT NULL,
            \`checkoutRequestId\` varchar(80) NULL,
            \`merchantRequestId\` varchar(80) NULL,
            \`mpesaReceipt\` varchar(80) NULL,
            \`status\` varchar(40) NOT NULL,
            \`statusDescription\` varchar(255) NULL,
            \`providerRawResponse\` text NULL,
            \`paidAt\` datetime NULL,
            \`sentAt\` datetime NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_sms_unit_purchases_church_created\` (\`churchId\`, \`createdAt\`),
            INDEX \`IDX_sms_unit_purchases_checkout\` (\`checkoutRequestId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created SMS unit purchases table.');
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureDiscipleshipTables() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const members = await queryRunner.getTable('discipleship_members');
      if (!members) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_members\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`fullName\` varchar(180) NOT NULL,
            \`phone\` varchar(40) NULL,
            \`email\` varchar(160) NULL,
            \`gender\` varchar(20) NULL,
            \`enrollmentDate\` date NULL,
            \`isFirstTimeAtChurch\` tinyint NULL,
            \`hasChurchRole\` tinyint NULL,
            \`churchRoleNotes\` text NULL,
            \`status\` varchar(40) NOT NULL DEFAULT 'active',
            \`notes\` text NULL,
            \`contributorId\` varchar(36) NULL,
            \`createdByUserId\` varchar(36) NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_discipleship_members_church_name\` (\`churchId\`, \`fullName\`),
            INDEX \`IDX_discipleship_members_church_phone\` (\`churchId\`, \`phone\`),
            INDEX \`IDX_discipleship_members_church_contributor\` (\`churchId\`, \`contributorId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship members table.');
      } else {
        if (!members.findColumnByName('contributorId')) {
          await queryRunner.query(
            'ALTER TABLE `discipleship_members` ADD COLUMN `contributorId` varchar(36) NULL AFTER `notes`',
          );
          this.logger.log('Added contributor link to discipleship members.');
        }
        const biodataStatements: string[] = [];
        if (!members.findColumnByName('isFirstTimeAtChurch')) {
          biodataStatements.push(
            'ADD COLUMN `isFirstTimeAtChurch` tinyint NULL AFTER `enrollmentDate`',
          );
        }
        if (!members.findColumnByName('hasChurchRole')) {
          biodataStatements.push(
            'ADD COLUMN `hasChurchRole` tinyint NULL AFTER `isFirstTimeAtChurch`',
          );
        }
        if (!members.findColumnByName('churchRoleNotes')) {
          biodataStatements.push(
            'ADD COLUMN `churchRoleNotes` text NULL AFTER `hasChurchRole`',
          );
        }
        if (biodataStatements.length > 0) {
          await queryRunner.query(
            `ALTER TABLE \`discipleship_members\` ${biodataStatements.join(', ')}`,
          );
          this.logger.log('Added discipleship member biodata columns.');
        }
        if (
          !members.indices.some(
            (index) =>
              index.name === 'IDX_discipleship_members_church_contributor',
          )
        ) {
          await queryRunner.query(
            'CREATE INDEX `IDX_discipleship_members_church_contributor` ON `discipleship_members` (`churchId`, `contributorId`)',
          );
          this.logger.log('Indexed contributor link on discipleship members.');
        }
      }
      await queryRunner.query(
        "UPDATE `discipleship_members` SET `status` = 'active' WHERE `status` <> 'active'",
      );

      const memberAliases = await queryRunner.getTable(
        'discipleship_member_aliases',
      );
      if (!memberAliases) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_member_aliases\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`memberId\` varchar(36) NOT NULL,
            \`contributorId\` varchar(36) NULL,
            \`alias\` varchar(180) NOT NULL,
            \`normalizedAlias\` varchar(180) NOT NULL,
            \`source\` varchar(30) NOT NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_discipleship_member_alias\` (\`memberId\`, \`normalizedAlias\`),
            INDEX \`IDX_discipleship_alias_church_name\` (\`churchId\`, \`normalizedAlias\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship member aliases table.');
      }

      const memberContributors = await queryRunner.getTable(
        'discipleship_member_contributors',
      );
      if (!memberContributors) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_member_contributors\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`memberId\` varchar(36) NOT NULL,
            \`contributorId\` varchar(36) NOT NULL,
            \`matchMethod\` varchar(40) NOT NULL,
            \`isConfirmed\` tinyint NOT NULL DEFAULT 1,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_discipleship_church_contributor\` (\`churchId\`, \`contributorId\`),
            UNIQUE KEY \`UQ_discipleship_member_contributor\` (\`memberId\`, \`contributorId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship member contributor links table.');
      }

      const matchCandidates = await queryRunner.getTable(
        'discipleship_match_candidates',
      );
      if (!matchCandidates) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_match_candidates\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`contributorId\` varchar(36) NOT NULL,
            \`candidateMemberId\` varchar(36) NOT NULL,
            \`observedName\` varchar(180) NOT NULL,
            \`normalizedName\` varchar(180) NOT NULL,
            \`matchReason\` varchar(120) NOT NULL,
            \`matchScore\` int NOT NULL DEFAULT 0,
            \`status\` varchar(20) NOT NULL DEFAULT 'pending',
            \`reviewedByUserId\` varchar(36) NULL,
            \`reviewedAt\` datetime NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_discipleship_match_candidate\` (\`contributorId\`, \`candidateMemberId\`),
            INDEX \`IDX_discipleship_match_status\` (\`churchId\`, \`status\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship match candidates table.');
      }

      const duplicateReviews = await queryRunner.getTable(
        'discipleship_duplicate_reviews',
      );
      if (!duplicateReviews) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_duplicate_reviews\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`clusterKey\` varchar(500) NOT NULL,
            \`memberIdsSnapshot\` text NOT NULL,
            \`status\` varchar(20) NOT NULL,
            \`reviewedByUserId\` varchar(36) NULL,
            \`reviewedAt\` datetime NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_discipleship_duplicate_cluster\` (\`churchId\`, \`clusterKey\`),
            INDEX \`IDX_discipleship_duplicate_status\` (\`churchId\`, \`status\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship duplicate review table.');
      }

      await queryRunner.query(`
        INSERT IGNORE INTO \`discipleship_member_aliases\`
          (\`id\`, \`churchId\`, \`memberId\`, \`contributorId\`, \`alias\`, \`normalizedAlias\`, \`source\`, \`createdAt\`)
        SELECT
          UUID(), member.\`churchId\`, member.\`id\`, NULL, member.\`fullName\`,
          LOWER(TRIM(REGEXP_REPLACE(member.\`fullName\`, '[[:space:]]+', ' '))),
          'manual', NOW(6)
        FROM \`discipleship_members\` member
        WHERE member.\`fullName\` IS NOT NULL AND TRIM(member.\`fullName\`) <> ''
      `);
      await queryRunner.query(`
        INSERT IGNORE INTO \`discipleship_member_contributors\`
          (\`id\`, \`churchId\`, \`memberId\`, \`contributorId\`, \`matchMethod\`, \`isConfirmed\`, \`createdAt\`)
        SELECT
          UUID(), member.\`churchId\`, member.\`id\`, member.\`contributorId\`,
          'legacy_link', 1, NOW(6)
        FROM \`discipleship_members\` member
        WHERE member.\`contributorId\` IS NOT NULL
      `);

      const groups = await queryRunner.getTable('discipleship_groups');
      if (!groups) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_groups\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`name\` varchar(160) NOT NULL,
            \`description\` text NULL,
            \`isActive\` tinyint NOT NULL DEFAULT 1,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_discipleship_groups_church_name\` (\`churchId\`, \`name\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship groups table.');
      }

      const memberships = await queryRunner.getTable(
        'discipleship_memberships',
      );
      if (!memberships) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_memberships\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`memberId\` varchar(36) NOT NULL,
            \`groupId\` varchar(36) NOT NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_discipleship_member_group\` (\`memberId\`, \`groupId\`),
            INDEX \`IDX_discipleship_memberships_church_member\` (\`churchId\`, \`memberId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship memberships table.');
      }

      const attendance = await queryRunner.getTable('discipleship_attendance');
      if (!attendance) {
        await queryRunner.query(`
          CREATE TABLE \`discipleship_attendance\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`memberId\` varchar(36) NOT NULL,
            \`attendanceDate\` date NOT NULL,
            \`weekday\` varchar(20) NOT NULL,
            \`attendanceType\` varchar(20) NOT NULL,
            \`groupId\` varchar(36) NULL,
            \`eventName\` varchar(160) NULL,
            \`markedByUserId\` varchar(36) NULL,
            \`markedAt\` datetime NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_discipleship_attendance_church_date\` (\`churchId\`, \`attendanceDate\`),
            INDEX \`IDX_discipleship_attendance_member_date\` (\`memberId\`, \`attendanceDate\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created discipleship attendance table.');
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureCongregationPageTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const table = await queryRunner.getTable('church_congregation_pages');

      if (!table) {
        await queryRunner.query(`
          CREATE TABLE \`church_congregation_pages\` (
            \`id\` varchar(36) NOT NULL,
            \`churchId\` varchar(36) NOT NULL,
            \`isPublished\` tinyint NOT NULL DEFAULT 1,
            \`heroTitle\` varchar(180) NULL,
            \`welcomeMessage\` text NULL,
            \`verseReference\` varchar(180) NULL,
            \`verseText\` text NULL,
            \`dailyVerses\` text NULL,
            \`featuredImageUrl\` varchar(500) NULL,
            \`serviceTimes\` text NULL,
            \`events\` text NULL,
            \`massPrograms\` text NULL,
            \`sermons\` text NULL,
            \`fundDisplays\` text NULL,
            \`galleryImages\` text NULL,
            \`contactNote\` text NULL,
            \`updatedByUserId\` varchar(36) NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_church_congregation_pages_church\` (\`churchId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        this.logger.log('Created church congregation pages table.');
        return;
      }

      const statements: string[] = [];

      if (!table.findColumnByName('churchId')) {
        statements.push(
          'ADD COLUMN `churchId` varchar(36) NOT NULL AFTER `id`',
        );
      }
      if (!table.findColumnByName('isPublished')) {
        statements.push(
          'ADD COLUMN `isPublished` tinyint NOT NULL DEFAULT 1 AFTER `churchId`',
        );
      }
      if (!table.findColumnByName('heroTitle')) {
        statements.push(
          'ADD COLUMN `heroTitle` varchar(180) NULL AFTER `isPublished`',
        );
      }
      if (!table.findColumnByName('welcomeMessage')) {
        statements.push(
          'ADD COLUMN `welcomeMessage` text NULL AFTER `heroTitle`',
        );
      }
      if (!table.findColumnByName('verseReference')) {
        statements.push(
          'ADD COLUMN `verseReference` varchar(180) NULL AFTER `welcomeMessage`',
        );
      }
      if (!table.findColumnByName('verseText')) {
        statements.push(
          'ADD COLUMN `verseText` text NULL AFTER `verseReference`',
        );
      }
      if (!table.findColumnByName('dailyVerses')) {
        statements.push('ADD COLUMN `dailyVerses` text NULL AFTER `verseText`');
      }
      if (!table.findColumnByName('featuredImageUrl')) {
        statements.push(
          'ADD COLUMN `featuredImageUrl` varchar(500) NULL AFTER `dailyVerses`',
        );
      }
      if (!table.findColumnByName('serviceTimes')) {
        statements.push(
          'ADD COLUMN `serviceTimes` text NULL AFTER `featuredImageUrl`',
        );
      }
      if (!table.findColumnByName('events')) {
        statements.push('ADD COLUMN `events` text NULL AFTER `serviceTimes`');
      }
      if (!table.findColumnByName('massPrograms')) {
        statements.push('ADD COLUMN `massPrograms` text NULL AFTER `events`');
      }
      if (!table.findColumnByName('sermons')) {
        statements.push('ADD COLUMN `sermons` text NULL AFTER `massPrograms`');
      }
      if (!table.findColumnByName('fundDisplays')) {
        statements.push('ADD COLUMN `fundDisplays` text NULL AFTER `sermons`');
      }
      if (!table.findColumnByName('galleryImages')) {
        statements.push(
          'ADD COLUMN `galleryImages` text NULL AFTER `fundDisplays`',
        );
      }
      if (!table.findColumnByName('contactNote')) {
        statements.push(
          'ADD COLUMN `contactNote` text NULL AFTER `galleryImages`',
        );
      }
      if (!table.findColumnByName('updatedByUserId')) {
        statements.push(
          'ADD COLUMN `updatedByUserId` varchar(36) NULL AFTER `contactNote`',
        );
      }
      if (!table.findColumnByName('createdAt')) {
        statements.push(
          'ADD COLUMN `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER `updatedByUserId`',
        );
      }
      if (!table.findColumnByName('updatedAt')) {
        statements.push(
          'ADD COLUMN `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) AFTER `createdAt`',
        );
      }

      if (statements.length > 0) {
        await queryRunner.query(
          `ALTER TABLE \`church_congregation_pages\` ${statements.join(', ')}`,
        );
        this.logger.log(
          `Applied congregation page schema bootstrap with ${statements.length} column updates.`,
        );
      }
    } finally {
      await queryRunner.release();
    }
  }
}
