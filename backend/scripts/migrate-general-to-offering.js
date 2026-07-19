#!/usr/bin/env node

/**
 * Retires the per-church "General" fallback fund account and moves its role and
 * its contributions to the church's "Offering" account.
 *
 * For every church, this script:
 *   1. Finds the General account (code/name 'general') and the Offering account.
 *   2. Reassigns every contribution from General to Offering.
 *   3. Adds "General" to Offering's aliases, so M-Pesa references that still say
 *      "General" keep routing correctly instead of hitting the fallback path.
 *   4. Marks Offering as isFallback = 1.
 *   5. Deletes the now-empty General account.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 *   node scripts/migrate-general-to-offering.js            # report only
 *   node scripts/migrate-general-to-offering.js --apply    # perform migration
 *   node scripts/migrate-general-to-offering.js --apply --church <churchId>
 *
 * TAKE A DATABASE BACKUP BEFORE RUNNING WITH --apply. Reassigning contributions
 * is not reversible by this script.
 */

const path = require('path');
const mysql = require('mysql2/promise');

// Load backend/.env so the script works from any shell without the caller
// having to source it first. Without this it silently falls back to
// root@localhost with no password, which fails confusingly.
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  // dotenv is optional; env vars may already be present.
}

const APPLY = process.argv.includes('--apply');
const churchFlagIndex = process.argv.indexOf('--church');
const ONLY_CHURCH_ID =
  churchFlagIndex !== -1 ? process.argv[churchFlagIndex + 1] : null;

const LEGACY_CODE = 'general';
const TARGET_CODE = 'offering';
const TARGET_NAME = 'Offering';
const TARGET_DESCRIPTION =
  'General church offering. Also receives payments whose M-Pesa account reference does not match another fund account.';

const normalize = (value) =>
  `${value ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');

function parseAliases(raw) {
  // TypeORM simple-array stores a comma-separated string.
  return `${raw ?? ''}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatKes(value) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function main() {
  // Fail loudly rather than falling back to root@localhost, which produces a
  // misleading "Access denied" instead of naming the real problem.
  if (!process.env.DB_USER || !process.env.DB_NAME) {
    console.error(
      'ERROR: DB_USER / DB_NAME not set and backend/.env was not found.\n' +
        'Run from the backend directory, or: set -a; source .env; set +a',
    );
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  console.log(
    `Connected to ${process.env.DB_NAME} as ${process.env.DB_USER}@${process.env.DB_HOST || 'localhost'}\n`,
  );

  console.log(
    APPLY
      ? '=== APPLYING MIGRATION (writes enabled) ==='
      : '=== DRY RUN (no writes; pass --apply to commit) ===',
  );

  const [columns] = await connection.query(
    `SHOW COLUMNS FROM fund_accounts LIKE 'isFallback'`,
  );
  if (!columns.length) {
    console.error(
      '\nERROR: fund_accounts.isFallback does not exist yet.\n' +
        'Start the backend once so SchemaBootstrapService adds the column, then re-run.',
    );
    await connection.end();
    process.exit(1);
  }

  const churchFilter = ONLY_CHURCH_ID ? 'WHERE id = ?' : '';
  const churchParams = ONLY_CHURCH_ID ? [ONLY_CHURCH_ID] : [];
  const [churches] = await connection.query(
    `SELECT id, name, slug FROM churches ${churchFilter}`,
    churchParams,
  );

  const summary = {
    churches: 0,
    contributionsMoved: 0,
    amountMoved: 0,
    generalDeleted: 0,
    offeringCreated: 0,
    skipped: [],
  };

  for (const church of churches) {
    const [accounts] = await connection.query(
      `SELECT id, name, code, description, aliases, isActive, isFallback, displayOrder, receiptTemplate
         FROM fund_accounts WHERE churchId = ?`,
      [church.id],
    );

    const general = accounts.find(
      (a) => normalize(a.code) === LEGACY_CODE || normalize(a.name) === LEGACY_CODE,
    );
    let offering = accounts.find((a) => normalize(a.code) === TARGET_CODE);

    if (!general && offering && offering.isFallback) {
      continue; // Already migrated.
    }

    console.log(`\n--- ${church.name} (${church.slug}) ---`);

    // A church with no Offering account needs one before General can retire.
    if (!offering) {
      console.log('  No Offering account found; it will be created.');
      if (APPLY) {
        const [result] = await connection.query(
          `INSERT INTO fund_accounts
             (id, churchId, name, code, description, isActive, isFallback, displayOrder, receiptTemplate, aliases, createdAt, updatedAt)
           VALUES (UUID(), ?, ?, ?, ?, 1, 1, 2, ?, ?, NOW(), NOW())`,
          [
            church.id,
            TARGET_NAME,
            TARGET_CODE,
            TARGET_DESCRIPTION,
            general?.receiptTemplate ||
              'Dear {name}, we acknowledge receipt of your {account} contribution of KES {amount}',
            'General',
          ],
        );
        void result;
        const [created] = await connection.query(
          `SELECT id, aliases FROM fund_accounts WHERE churchId = ? AND code = ?`,
          [church.id, TARGET_CODE],
        );
        offering = created[0];
      } else {
        offering = { id: '<new>', aliases: '' };
      }
      summary.offeringCreated += 1;
    }

    if (general) {
      const [[stats]] = await connection.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
           FROM contributions WHERE fundAccountId = ?`,
        [general.id],
      );

      console.log(
        `  General holds ${stats.count} contribution(s) totalling ${formatKes(stats.total)}.`,
      );
      console.log(`  -> reassigning to Offering (${offering.id})`);

      if (APPLY) {
        // fundAccountName is denormalized onto contributions for reporting, so
        // it has to move too or old rows keep displaying "General".
        await connection.query(
          `UPDATE contributions SET fundAccountId = ?, fundAccountName = ? WHERE fundAccountId = ?`,
          [offering.id, TARGET_NAME, general.id],
        );
      }

      summary.contributionsMoved += Number(stats.count || 0);
      summary.amountMoved += Number(stats.total || 0);
    } else {
      console.log('  No General account; only flagging Offering as fallback.');
    }

    // Preserve "General" as an alias so existing M-Pesa references still match.
    const aliases = parseAliases(offering.aliases);
    if (!aliases.some((alias) => normalize(alias) === LEGACY_CODE)) {
      aliases.push('General');
    }

    console.log(`  -> Offering aliases: ${aliases.join(', ') || '(none)'}`);
    console.log('  -> Offering marked as fallback');

    if (APPLY) {
      await connection.query(
        `UPDATE fund_accounts SET isFallback = 1, isActive = 1, aliases = ? WHERE id = ?`,
        [aliases.join(','), offering.id],
      );

      // Any other account claiming fallback would make routing ambiguous.
      await connection.query(
        `UPDATE fund_accounts SET isFallback = 0 WHERE churchId = ? AND id <> ?`,
        [church.id, offering.id],
      );
    }

    if (general) {
      const [[remaining]] = await connection.query(
        `SELECT COUNT(*) AS count FROM contributions WHERE fundAccountId = ?`,
        [general.id],
      );

      if (APPLY && Number(remaining.count) > 0) {
        console.log(
          `  !! SKIPPED delete: General still has ${remaining.count} contribution(s).`,
        );
        summary.skipped.push(`${church.slug}: General not empty after reassign`);
      } else {
        console.log('  -> deleting General account');
        if (APPLY) {
          await connection.query(`DELETE FROM fund_accounts WHERE id = ?`, [
            general.id,
          ]);
        }
        summary.generalDeleted += 1;
      }
    }

    summary.churches += 1;
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Churches affected:      ${summary.churches}`);
  console.log(`Offering accounts made: ${summary.offeringCreated}`);
  console.log(`Contributions moved:    ${summary.contributionsMoved}`);
  console.log(`Amount moved:           ${formatKes(summary.amountMoved)}`);
  console.log(`General accounts gone:  ${summary.generalDeleted}`);
  if (summary.skipped.length) {
    console.log(`Skipped:\n  ${summary.skipped.join('\n  ')}`);
  }
  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to commit.');
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
