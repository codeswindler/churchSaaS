#!/usr/bin/env node

/**
 * Agape-only demo data seeder.
 *
 * This script intentionally lives outside the running Nest application so demo
 * data is only created when a priest/admin deliberately runs the command or a
 * VPS cron entry invokes it. It never changes callbacks, credentials, real
 * contributions, or any non-Agape church.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const mysql = require('mysql2/promise');

const DEFAULT_AGAPE_CHURCH_ID = '55f91f65-2ab1-44fb-ae65-d370650a5334';
const DEFAULT_AGAPE_SLUG = 'agape';
const INTERNAL_SEED_MARKER = 'agape_daily_seed';
const MEMBER_PREFIX = 'AGP';
const MATCH_METHOD = 'demo_seed';
const ATTENDANCE_EVENT_NAME = 'Giving attendance';
const KENYA_TIMEZONE = 'Africa/Nairobi';
const DEFAULT_MEMBER_TARGET = 8291;
const DEFAULT_ACTIVE_MEMBER_TARGET = 7327;
const DEFAULT_DAILY_CONTRIBUTORS = 500;

const FEMALE_FIRST_NAMES = [
  'Grace',
  'Faith',
  'Mercy',
  'Mary',
  'Esther',
  'Lucy',
  'Jane',
  'Agnes',
  'Ruth',
  'Caroline',
  'Ann',
  'Beatrice',
  'Eunice',
  'Irene',
  'Rose',
  'Catherine',
  'Lydia',
  'Naomi',
  'Sarah',
  'Elizabeth',
  'Rebecca',
  'Hannah',
  'Joyce',
  'Diana',
  'Monica',
  'Teresa',
  'Susan',
  'Purity',
  'Janet',
  'Priscah',
  'Miriam',
  'Florence',
  'Margaret',
  'Pauline',
  'Alice',
  'Christine',
  'Millicent',
  'Veronica',
  'Nancy',
  'Dorcas',
  'Leah',
  'Tabitha',
  'Naomi',
  'Loise',
  'Sharon',
  'Joy',
  'Winnie',
  'Hellen',
  'Lilian',
  'Gladys',
  'Damaris',
  'Emily',
  'Esther',
  'Judith',
  'Martha',
  'Phoebe',
  'Deborah',
  'Cynthia',
  'Rosemary',
  'Peninah',
];

const MALE_FIRST_NAMES = [
  'Peter',
  'John',
  'Samuel',
  'Daniel',
  'Joseph',
  'David',
  'George',
  'Paul',
  'Simon',
  'Moses',
  'Francis',
  'Isaac',
  'Martin',
  'Patrick',
  'Stephen',
  'Brian',
  'Anthony',
  'Michael',
  'Kevin',
  'James',
  'Philip',
  'Robert',
  'Charles',
  'Andrew',
  'Victor',
  'Emmanuel',
  'Nicholas',
  'Collins',
  'Timothy',
  'Alex',
  'Edwin',
  'Dennis',
  'Kenneth',
  'Gabriel',
  'Leonard',
  'Vincent',
  'Julius',
  'Eric',
  'Oscar',
  'Benjamin',
  'Elijah',
  'Joshua',
  'Caleb',
  'Mark',
  'Luke',
  'Joel',
  'Ezekiel',
  'Daniel',
  'Stephen',
  'Festus',
  'Titus',
  'Solomon',
  'Amos',
  'Barnabas',
  'Silas',
  'Joseph',
  'Gideon',
  'Boniface',
  'Felix',
  'Kelvin',
];

const FAMILY_NAMES = [
  'Wambui',
  'Mwangi',
  'Njeri',
  'Otieno',
  'Achieng',
  'Kiptoo',
  'Wanjiku',
  'Mutua',
  'Wairimu',
  'Kariuki',
  'Atieno',
  'Maina',
  'Muthoni',
  'Ochieng',
  'Nyambura',
  'Karanja',
  'Chebet',
  'Njoroge',
  'Jepkoech',
  'Kamau',
  'Waithera',
  'Omondi',
  'Wanjiru',
  'Kimani',
  'Moraa',
  'Onyango',
  'Naliaka',
  'Mbugua',
  'Nyokabi',
  'Langat',
  'Ouma',
  'Mumbi',
  'Njuguna',
  'Wangari',
  'Mutiso',
  'Cherono',
  'Odhiambo',
  'Macharia',
  'Akinyi',
  'Bett',
  'Makena',
  'Wekesa',
  'Githinji',
  'Jepchirchir',
  'Muli',
  'Wanjala',
  'Kiprono',
  'Nyawira',
  'Barasa',
  'Kibet',
  'Nekesa',
  'Gakuru',
  'Njenga',
  'Chepkemoi',
  'Munene',
  'Anyango',
  'Wainaina',
  'Kipchumba',
  'Mbithe',
  'Muriithi',
  'Omollo',
  'Njoki',
  'Koech',
  'Oloo',
  'Wangui',
  'Gacheri',
  'Muthama',
  'Nyaga',
  'Awino',
  'Chege',
  'Namusasi',
  'Kiplagat',
  'Makenzi',
  'Were',
  'Kendi',
  'Kilonzo',
  'Waweru',
  'Mboya',
  'Juma',
  'Mitei',
];

const GROUP_DEFINITIONS = [
  ['Agape Home Cell 01 - Uplands', 'Cell group for Uplands families.'],
  ['Agape Home Cell 02 - Town', 'Cell group for town-side members.'],
  ['Agape Home Cell 03 - Kiamumbi', 'Cell group for Kiamumbi members.'],
  ['Agape Home Cell 04 - Kahawa', 'Cell group for Kahawa members.'],
  ['Agape Youth Fellowship', 'Youth fellowship membership.'],
  ['Agape Women Fellowship', 'Women fellowship membership.'],
  ['Agape Men Fellowship', 'Men fellowship membership.'],
  ['Agape Choir & Worship', 'Worship team and choir membership.'],
  ['Agape Ushers & Hospitality', 'Ushering and hospitality membership.'],
  ['Agape Prayer Team', 'Prayer and intercession membership.'],
  ['Agape Teens Ministry', 'Teens ministry membership.'],
  ['Agape Outreach Team', 'Outreach and missions membership.'],
];

const ROLE_NOTES = [
  'Choir member',
  'Ushering team',
  'Home cell assistant',
  'Prayer team volunteer',
  'Youth mentor',
  'Hospitality volunteer',
  'Outreach volunteer',
];

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const equalsAt = trimmed.indexOf('=');
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function printHelp() {
  console.log(`Agape demo data seeder

Usage:
  npm run seed:agape-demo -- [options]

Options:
  --date <YYYY-MM-DD|today>     Kenya calendar date to seed. Default: today.
  --members <number>            Ensure this many total Agape members. Default: 8291.
  --active-members <number>     Target active Agape members. Default: 7327.
  --contributors <number>       Daily contributing members. Default: 500.
  --min <amount>                Minimum daily total in KES. Default: 400000.
  --max <amount>                Maximum daily total in KES. Default: 600000.
  --members-only                Create/update demo members, groups, and links only.
  --progressive                 For today, add only transactions due up to the current Kenya time.
  --refresh-date                Delete and recreate only this date's Agape demo contributions/attendance.
  --dry-run                     Report planned work without writing.
  --church-id <uuid>            Safety guard. Default: ${DEFAULT_AGAPE_CHURCH_ID}
  --slug <slug>                 Safety guard. Default: ${DEFAULT_AGAPE_SLUG}
  --help                        Show this help.

Examples:
  npm run seed:agape-demo -- --dry-run
  npm run seed:agape-demo -- --date today
  npm run seed:agape-demo -- --date today --progressive
  npm run seed:agape-demo -- --date 2026-07-03 --refresh-date
`);
}

function parseArgs(argv) {
  const options = {
    date: 'today',
    memberTarget: DEFAULT_MEMBER_TARGET,
    activeMemberTarget: DEFAULT_ACTIVE_MEMBER_TARGET,
    dailyContributors: DEFAULT_DAILY_CONTRIBUTORS,
    minDailyTotal: 400000,
    maxDailyTotal: 600000,
    dryRun: false,
    refreshDate: false,
    progressive: false,
    membersOnly: false,
    churchId:
      process.env.AGAPE_DEMO_CHURCH_ID ||
      process.env.DEMO_CHURCH_ID ||
      DEFAULT_AGAPE_CHURCH_ID,
    slug:
      process.env.AGAPE_DEMO_CHURCH_SLUG ||
      process.env.DEMO_CHURCH_SLUG ||
      DEFAULT_AGAPE_SLUG,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`Missing value after ${arg}`);
      }
      return argv[i];
    };

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--date':
        options.date = next();
        break;
      case '--members':
        options.memberTarget = parsePositiveInteger(next(), 'members');
        break;
      case '--active-members':
        options.activeMemberTarget = parsePositiveInteger(
          next(),
          'active-members',
        );
        break;
      case '--contributors':
        options.dailyContributors = parsePositiveInteger(
          next(),
          'contributors',
        );
        break;
      case '--min':
        options.minDailyTotal = parsePositiveNumber(next(), 'min');
        break;
      case '--max':
        options.maxDailyTotal = parsePositiveNumber(next(), 'max');
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--refresh-date':
        options.refreshDate = true;
        break;
      case '--progressive':
        options.progressive = true;
        break;
      case '--members-only':
        options.membersOnly = true;
        break;
      case '--church-id':
        options.churchId = next();
        break;
      case '--slug':
        options.slug = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.date = normalizeDateOption(options.date);
  options.today = kenyaDateToday();

  if (options.progressive && options.date !== options.today) {
    throw new Error('--progressive is only supported with --date today.');
  }

  if (options.slug !== DEFAULT_AGAPE_SLUG) {
    throw new Error(
      `Refusing to seed slug "${options.slug}". This command is Agape-only.`,
    );
  }

  if (options.churchId !== DEFAULT_AGAPE_CHURCH_ID) {
    throw new Error(
      `Refusing to seed church id "${options.churchId}". This command is locked to Agape.`,
    );
  }

  if (options.memberTarget < options.dailyContributors) {
    throw new Error(
      `members (${options.memberTarget}) must be >= contributors (${options.dailyContributors}).`,
    );
  }

  if (options.memberTarget < options.activeMemberTarget) {
    throw new Error(
      `members (${options.memberTarget}) must be >= active-members (${options.activeMemberTarget}).`,
    );
  }

  if (options.activeMemberTarget < options.dailyContributors) {
    throw new Error(
      `active-members (${options.activeMemberTarget}) must be >= contributors (${options.dailyContributors}).`,
    );
  }

  if (options.minDailyTotal > options.maxDailyTotal) {
    throw new Error('min cannot be greater than max.');
  }

  return options;
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parsePositiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function normalizeDateOption(value) {
  const lower = String(value || '').toLowerCase();
  if (lower === 'today') {
    return kenyaDateToday();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD or today.`);
  }

  return value;
}

function kenyaDateToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KENYA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function kenyaTimeNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KENYA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '0';
  const hour = Number.parseInt(get('hour'), 10);
  const minute = Number.parseInt(get('minute'), 10);
  const second = Number.parseInt(get('second'), 10);

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    secondsFromMidnight: hour * 3600 + minute * 60 + second,
  };
}

function dateFromKenyaDate(date) {
  return new Date(`${date}T00:00:00.000+03:00`);
}

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = dateFromKenyaDate(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return formatDate(copy);
}

function weekdayName(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: KENYA_TIMEZONE,
    weekday: 'long',
  }).format(dateFromKenyaDate(date));
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function demoMemberNumber(seq) {
  return `${MEMBER_PREFIX}-${String(seq).padStart(5, '0')}`;
}

function demoPaymentPrefix(date) {
  return `${INTERNAL_SEED_MARKER}:${date}`;
}

function demoPaymentReference(date, seq) {
  const month = Number.parseInt(date.slice(5, 7), 10);
  const monthCode = String.fromCharCode('A'.charCodeAt(0) + month - 1);
  const hash = hashString(`${date}:${seq}:agape:mpesa`)
    .toString(36)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .padStart(8, '0')
    .slice(-8);
  return `U${monthCode}${hash}`;
}

function demoProfile(seq) {
  const gender = seq % 2 === 0 ? 'female' : 'male';
  const firstNames =
    gender === 'female' ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;
  const firstName = firstNames[(seq * 7) % firstNames.length];
  const middleName = FAMILY_NAMES[(seq * 11) % FAMILY_NAMES.length];
  const familyName = FAMILY_NAMES[(seq * 17 + 13) % FAMILY_NAMES.length];
  const memberNumber = demoMemberNumber(seq);
  const localNumber = String(10000000 + ((seq * 7919) % 8999999)).padStart(
    8,
    '0',
  );
  const enrollmentDate = addDays('2024-01-01', (seq * 5) % 820);
  const hasChurchRole = seq % 11 === 0;
  const churchRoleNotes = hasChurchRole
    ? ROLE_NOTES[(seq * 3) % ROLE_NOTES.length]
    : null;

  return {
    seq,
    memberNumber,
    name: `${firstName} ${middleName} ${familyName}`,
    phone: `2547${localNumber.slice(0, 8)}`,
    gender,
    email: null,
    enrollmentDate,
    isFirstTimeAtChurch: seq % 23 === 0,
    hasChurchRole,
    churchRoleNotes,
  };
}

function kenyaTimestamp(date, secondsFromMidnight) {
  const hours = Math.floor(secondsFromMidnight / 3600);
  const minutes = Math.floor((secondsFromMidnight % 3600) / 60);
  const seconds = secondsFromMidnight % 60;
  return `${date} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0',
  )}:${String(seconds).padStart(2, '0')}`;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function placeholders(rows, columns) {
  return rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
}

function flattenRows(rows, columns) {
  return rows.flatMap((row) => columns.map((column) => row[column]));
}

async function bulkInsert(connection, table, columns, rows, batchSize = 500) {
  if (rows.length === 0) {
    return 0;
  }

  let inserted = 0;
  for (const rowsChunk of chunk(rows, batchSize)) {
    const sql = `INSERT INTO \`${table}\` (${columns
      .map((column) => `\`${column}\``)
      .join(', ')}) VALUES ${placeholders(rowsChunk, columns)}`;
    await connection.query(sql, flattenRows(rowsChunk, columns));
    inserted += rowsChunk.length;
  }
  return inserted;
}

async function selectByChunks(
  connection,
  sqlPrefix,
  churchId,
  ids,
  idColumnName,
) {
  const rows = [];
  for (const idsChunk of chunk(ids, 500)) {
    if (idsChunk.length === 0) {
      continue;
    }
    const marks = idsChunk.map(() => '?').join(', ');
    const [result] = await connection.query(
      `${sqlPrefix} ${idColumnName} IN (${marks})`,
      [churchId, ...idsChunk],
    );
    rows.push(...result);
  }
  return rows;
}

async function main() {
  loadDotEnv(path.join(__dirname, '..', '.env'));
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'church_system',
    decimalNumbers: true,
    timezone: '+03:00',
    supportBigNumbers: true,
  });

  let lockAcquired = false;
  const lockName = `agape-demo-seed:${options.date}`;

  try {
    await connection.query("SET time_zone = '+03:00'");
    const [lockRows] = await connection.query(
      'SELECT GET_LOCK(?, 5) AS gotLock',
      [lockName],
    );
    lockAcquired = Number(lockRows[0]?.gotLock || 0) === 1;
    if (!lockAcquired) {
      throw new Error(`Another Agape demo seed run is active (${lockName}).`);
    }

    await runSeed(connection, options);
  } finally {
    if (lockAcquired) {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    }
    await connection.end();
  }
}

async function runSeed(connection, options) {
  const summary = {
    church: null,
    funds: 0,
    contributorsCreated: 0,
    membersCreated: 0,
    totalMembersBefore: 0,
    activeMembersBefore: 0,
    nonGeneratedMembers: 0,
    nonGeneratedActiveMembers: 0,
    generatedMemberTarget: 0,
    generatedActiveTarget: 0,
    generatedMembersActivated: 0,
    generatedMembersDeactivated: 0,
    memberContributorLinksBackfilled: 0,
    linksCreated: 0,
    groupsCreated: 0,
    membershipsCreated: 0,
    legacyContributionNotesSanitized: 0,
    legacyMemberNotesSanitized: 0,
    legacyGroupDescriptionsSanitized: 0,
    refreshedContributionsDeleted: 0,
    refreshedAttendanceDeleted: 0,
    contributionsCreated: 0,
    attendanceCreated: 0,
    skippedDailySeed: false,
    existingDailyContributions: 0,
    existingDailyTotal: 0,
    plannedDailyTotal: 0,
    dueDailyContributions: 0,
    pendingDailyContributions: 0,
    missingDueContributions: 0,
  };

  const [churchRows] = await connection.query(
    'SELECT id, name, slug, status FROM churches WHERE id = ? AND slug = ? LIMIT 1',
    [options.churchId, options.slug],
  );

  const church = churchRows[0];
  if (!church) {
    throw new Error(
      `Agape safety guard failed. No church matched id=${options.churchId} slug=${options.slug}.`,
    );
  }

  if (church.status !== 'active') {
    throw new Error(`Agape church is not active (status=${church.status}).`);
  }

  summary.church = church;

  const [funds] = await connection.query(
    `SELECT id, name, code
     FROM fund_accounts
     WHERE churchId = ?
       AND isActive = 1
       AND archivedAt IS NULL
     ORDER BY displayOrder ASC, name ASC`,
    [church.id],
  );

  if (funds.length === 0) {
    throw new Error('Agape has no active fund accounts to seed against.');
  }

  summary.funds = funds.length;
  const memberTargets = await getAgapeMemberSeedTargets(
    connection,
    church.id,
    options,
    summary,
  );

  if (options.dryRun) {
    await collectDryRunSummary(
      connection,
      options,
      funds,
      summary,
      memberTargets,
    );
    printSummary(options, summary);
    return;
  }

  await connection.beginTransaction();
  try {
    const contributors = await ensureDemoContributors(
      connection,
      church.id,
      memberTargets.generatedMemberTarget,
      summary,
    );
    await sanitizeLegacyVisibleMarkers(connection, church.id, summary);
    const memberLinks = await ensureDiscipleshipMembers(
      connection,
      church.id,
      contributors,
      summary,
    );
    await backfillDemoMemberContributorLinks(connection, church.id, summary);
    await rebalanceGeneratedMemberStatuses(
      connection,
      church.id,
      memberTargets.generatedActiveTarget,
      summary,
    );
    const groups = await ensureDemoGroups(connection, church.id, summary);
    const memberships = await ensureDemoMemberships(
      connection,
      church.id,
      contributors,
      memberLinks,
      groups,
      summary,
    );
    const activeContributors = await getActiveDemoContributors(
      connection,
      church.id,
      options.dailyContributors,
    );

    if (!options.membersOnly) {
      await seedDailyContributions(
        connection,
        church,
        funds,
        activeContributors,
        memberLinks,
        memberships,
        options,
        summary,
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  printSummary(options, summary);
}

async function getAgapeMemberSeedTargets(
  connection,
  churchId,
  options,
  summary,
) {
  const generatedMemberExists = `EXISTS (
    SELECT 1
    FROM contributors contributor
    LEFT JOIN discipleship_member_contributors link
      ON link.churchId = member.churchId
     AND link.memberId = member.id
     AND link.contributorId = contributor.id
     AND link.isConfirmed = 1
    WHERE contributor.churchId = member.churchId
      AND contributor.memberNumber LIKE ?
      AND (
        contributor.id = member.contributorId
        OR link.id IS NOT NULL
      )
  )`;
  const [rows] = await connection.query(
    `SELECT
       COUNT(member.id) AS totalMembers,
       SUM(CASE WHEN member.status = 'active' THEN 1 ELSE 0 END) AS activeMembers,
       SUM(CASE WHEN ${generatedMemberExists} THEN 1 ELSE 0 END) AS generatedMembers,
       SUM(CASE WHEN ${generatedMemberExists} AND member.status = 'active' THEN 1 ELSE 0 END) AS generatedActiveMembers,
       SUM(CASE WHEN NOT ${generatedMemberExists} THEN 1 ELSE 0 END) AS nonGeneratedMembers,
       SUM(CASE WHEN NOT ${generatedMemberExists} AND member.status = 'active' THEN 1 ELSE 0 END) AS nonGeneratedActiveMembers
     FROM discipleship_members member
     WHERE member.churchId = ?`,
    [
      `${MEMBER_PREFIX}-%`,
      `${MEMBER_PREFIX}-%`,
      `${MEMBER_PREFIX}-%`,
      `${MEMBER_PREFIX}-%`,
      churchId,
    ],
  );
  const counts = rows[0] || {};
  const nonGeneratedMembers = Number(counts.nonGeneratedMembers || 0);
  const nonGeneratedActiveMembers = Number(
    counts.nonGeneratedActiveMembers || 0,
  );

  summary.totalMembersBefore = Number(counts.totalMembers || 0);
  summary.activeMembersBefore = Number(counts.activeMembers || 0);
  summary.nonGeneratedMembers = nonGeneratedMembers;
  summary.nonGeneratedActiveMembers = nonGeneratedActiveMembers;
  summary.generatedMemberTarget = Math.max(
    options.dailyContributors,
    options.memberTarget - nonGeneratedMembers,
  );
  summary.generatedActiveTarget = Math.min(
    summary.generatedMemberTarget,
    Math.max(
      options.dailyContributors,
      options.activeMemberTarget - nonGeneratedActiveMembers,
    ),
  );

  return {
    generatedMemberTarget: summary.generatedMemberTarget,
    generatedActiveTarget: summary.generatedActiveTarget,
  };
}

async function collectDryRunSummary(
  connection,
  options,
  funds,
  summary,
  memberTargets,
) {
  const [contributorRows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM contributors
     WHERE churchId = ?
       AND memberNumber LIKE ?`,
    [options.churchId, `${MEMBER_PREFIX}-%`],
  );
  const existingContributors = Number(contributorRows[0]?.count || 0);
  summary.contributorsCreated = Math.max(
    0,
    memberTargets.generatedMemberTarget - existingContributors,
  );

  const [memberRows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM discipleship_members dm
     JOIN contributors c ON c.id = dm.contributorId
     WHERE dm.churchId = ?
       AND c.memberNumber LIKE ?`,
    [options.churchId, `${MEMBER_PREFIX}-%`],
  );
  const existingMembers = Number(memberRows[0]?.count || 0);
  summary.membersCreated = Math.max(
    0,
    memberTargets.generatedMemberTarget - existingMembers,
  );

  await collectExistingDailySummary(connection, options, summary);
  if (!options.membersOnly) {
    const [contributors] = await connection.query(
      `SELECT id, name, phone, memberNumber, gender
       FROM contributors
       WHERE churchId = ?
         AND memberNumber LIKE ?
       ORDER BY memberNumber ASC
       LIMIT ?`,
      [
        options.churchId,
        `${MEMBER_PREFIX}-%`,
        memberTargets.generatedMemberTarget,
      ],
    );
    const plan = calculateDailyPlan(
      options,
      buildDryRunContributorPool(
        contributors,
        memberTargets.generatedActiveTarget,
      ),
      funds,
      new Map(),
    );
    const eligibleEntries = getEligiblePlanEntries(plan, options);
    summary.plannedDailyTotal = plan.targetTotal;
    summary.dueDailyContributions = eligibleEntries.length;
    summary.pendingDailyContributions =
      plan.entries.length - eligibleEntries.length;
    summary.missingDueContributions = Math.max(
      0,
      eligibleEntries.length - summary.existingDailyContributions,
    );
    if (!summary.existingDailyContributions || options.progressive) {
      summary.contributionsCreated = options.progressive
        ? summary.missingDueContributions
        : options.dailyContributors;
      summary.attendanceCreated = summary.contributionsCreated;
    }
  }
}

function buildDryRunContributorPool(existingContributors, target) {
  const byMemberNumber = new Map(
    existingContributors.map((contributor) => [
      contributor.memberNumber,
      contributor,
    ]),
  );
  const contributors = [...existingContributors];

  for (let seq = 1; seq <= target; seq += 1) {
    const profile = demoProfile(seq);
    if (byMemberNumber.has(profile.memberNumber)) {
      continue;
    }
    contributors.push({
      id: `dry-run-${profile.memberNumber}`,
      name: profile.name,
      phone: profile.phone,
      memberNumber: profile.memberNumber,
      gender: profile.gender,
    });
  }

  return contributors
    .sort((a, b) => String(a.memberNumber).localeCompare(b.memberNumber))
    .slice(0, target);
}

async function ensureDemoContributors(connection, churchId, target, summary) {
  const [existingRows] = await connection.query(
    `SELECT id, name, phone, memberNumber, gender
     FROM contributors
     WHERE churchId = ?
       AND memberNumber LIKE ?
     ORDER BY memberNumber ASC`,
    [churchId, `${MEMBER_PREFIX}-%`],
  );

  const existingByMemberNumber = new Map(
    existingRows.map((row) => [row.memberNumber, row]),
  );
  const rowsToInsert = [];
  const now = kenyaTimestamp(kenyaDateToday(), 12 * 3600);

  for (let seq = 1; seq <= target; seq += 1) {
    const profile = demoProfile(seq);
    if (existingByMemberNumber.has(profile.memberNumber)) {
      continue;
    }

    rowsToInsert.push({
      id: randomUUID(),
      churchId,
      name: profile.name,
      phone: profile.phone,
      memberNumber: profile.memberNumber,
      gender: profile.gender,
      createdAt: now,
      updatedAt: now,
    });
  }

  summary.contributorsCreated = await bulkInsert(
    connection,
    'contributors',
    [
      'id',
      'churchId',
      'name',
      'phone',
      'memberNumber',
      'gender',
      'createdAt',
      'updatedAt',
    ],
    rowsToInsert,
  );

  const [contributors] = await connection.query(
    `SELECT id, name, phone, memberNumber, gender
     FROM contributors
     WHERE churchId = ?
       AND memberNumber LIKE ?
     ORDER BY memberNumber ASC
     LIMIT ?`,
    [churchId, `${MEMBER_PREFIX}-%`, target],
  );

  if (contributors.length < target) {
    throw new Error(
      `Only ${contributors.length} demo contributors available after seeding; expected ${target}.`,
    );
  }

  return contributors;
}

async function sanitizeLegacyVisibleMarkers(connection, churchId, summary) {
  const [legacyContributionResult] = await connection.query(
    `UPDATE contributions
     SET notes = CASE
       WHEN notes LIKE '%account=tithe%' THEN 'M-Pesa C2B confirmation; account ref: tithe'
       WHEN notes LIKE '%account=offering%' THEN 'M-Pesa C2B confirmation; account ref: offering'
       WHEN notes LIKE '%account=wedding%' THEN 'M-Pesa C2B confirmation; account ref: wedding'
       WHEN notes LIKE '%account=harambee%' THEN 'M-Pesa C2B confirmation; account ref: harambee'
       WHEN notes LIKE '%account=general%' THEN 'M-Pesa C2B confirmation; account ref: general'
       WHEN notes LIKE '%account=funeral%' THEN 'M-Pesa C2B confirmation; account ref: funeral'
       ELSE 'M-Pesa C2B confirmation'
     END
     WHERE churchId = ?
       AND (
         notes LIKE 'Demo seed:%'
         OR notes LIKE '%simulated M-Pesa C2B%'
       )`,
    [churchId],
  );

  const [legacyMemberResult] = await connection.query(
    `UPDATE discipleship_members
     SET notes = NULL
     WHERE churchId = ?
       AND notes LIKE 'Demo seed:%'`,
    [churchId],
  );

  const [legacyGroupResult] = await connection.query(
    `UPDATE discipleship_groups
     SET description = REPLACE(description, 'Demo ', '')
     WHERE churchId = ?
       AND description LIKE 'Demo %'`,
    [churchId],
  );

  summary.legacyContributionNotesSanitized =
    legacyContributionResult.affectedRows || 0;
  summary.legacyMemberNotesSanitized = legacyMemberResult.affectedRows || 0;
  summary.legacyGroupDescriptionsSanitized =
    legacyGroupResult.affectedRows || 0;
}

async function ensureDiscipleshipMembers(
  connection,
  churchId,
  contributors,
  summary,
) {
  const contributorIds = contributors.map((contributor) => contributor.id);
  const existingLinkRows = await selectByChunks(
    connection,
    `SELECT contributorId, memberId
     FROM discipleship_member_contributors
     WHERE churchId = ? AND`,
    churchId,
    contributorIds,
    'contributorId',
  );

  const linkByContributorId = new Map(
    existingLinkRows.map((row) => [row.contributorId, row.memberId]),
  );

  const unlinkedContributorIds = contributorIds.filter(
    (id) => !linkByContributorId.has(id),
  );

  const existingMemberRows =
    unlinkedContributorIds.length > 0
      ? await selectByChunks(
          connection,
          `SELECT id, contributorId
           FROM discipleship_members
           WHERE churchId = ? AND`,
          churchId,
          unlinkedContributorIds,
          'contributorId',
        )
      : [];

  const existingMemberByContributorId = new Map(
    existingMemberRows.map((row) => [row.contributorId, row.id]),
  );

  const membersToInsert = [];
  const linksToInsert = [];

  for (const contributor of contributors) {
    if (linkByContributorId.has(contributor.id)) {
      continue;
    }

    let memberId = existingMemberByContributorId.get(contributor.id);
    const seq = sequenceFromMemberNumber(contributor.memberNumber);
    const profile = demoProfile(seq);

    if (!memberId) {
      memberId = randomUUID();
      const createdAt = kenyaTimestamp(profile.enrollmentDate, 9 * 3600);
      membersToInsert.push({
        id: memberId,
        churchId,
        fullName: contributor.name,
        phone: contributor.phone,
        email: profile.email,
        gender: contributor.gender,
        enrollmentDate: profile.enrollmentDate,
        isFirstTimeAtChurch: profile.isFirstTimeAtChurch ? 1 : 0,
        hasChurchRole: profile.hasChurchRole ? 1 : 0,
        churchRoleNotes: profile.churchRoleNotes,
        status: 'active',
        notes: null,
        contributorId: contributor.id,
        createdByUserId: null,
        createdAt,
        updatedAt: createdAt,
      });
    }

    linksToInsert.push({
      id: randomUUID(),
      churchId,
      memberId,
      contributorId: contributor.id,
      matchMethod: MATCH_METHOD,
      isConfirmed: 1,
      createdAt: kenyaTimestamp(kenyaDateToday(), 12 * 3600),
    });
    linkByContributorId.set(contributor.id, memberId);
  }

  summary.membersCreated = await bulkInsert(
    connection,
    'discipleship_members',
    [
      'id',
      'churchId',
      'fullName',
      'phone',
      'email',
      'gender',
      'enrollmentDate',
      'isFirstTimeAtChurch',
      'hasChurchRole',
      'churchRoleNotes',
      'status',
      'notes',
      'contributorId',
      'createdByUserId',
      'createdAt',
      'updatedAt',
    ],
    membersToInsert,
  );

  summary.linksCreated = await bulkInsert(
    connection,
    'discipleship_member_contributors',
    [
      'id',
      'churchId',
      'memberId',
      'contributorId',
      'matchMethod',
      'isConfirmed',
      'createdAt',
    ],
    linksToInsert,
  );

  return linkByContributorId;
}

async function backfillDemoMemberContributorLinks(connection, churchId, summary) {
  const [result] = await connection.query(
    `UPDATE discipleship_members member
     JOIN discipleship_member_contributors link
       ON link.churchId = member.churchId
      AND link.memberId = member.id
      AND link.isConfirmed = 1
     JOIN contributors contributor
       ON contributor.id = link.contributorId
      AND contributor.churchId = member.churchId
      AND contributor.memberNumber LIKE ?
     SET member.contributorId = contributor.id,
         member.updatedAt = NOW(6)
     WHERE member.churchId = ?
       AND member.contributorId IS NULL`,
    [`${MEMBER_PREFIX}-%`, churchId],
  );

  summary.memberContributorLinksBackfilled = result.affectedRows || 0;
}

async function rebalanceGeneratedMemberStatuses(
  connection,
  churchId,
  generatedActiveTarget,
  summary,
) {
  const [generatedMembers] = await connection.query(
    `SELECT member.id, member.status, contributor.memberNumber
     FROM discipleship_members member
     JOIN contributors contributor
       ON contributor.id = member.contributorId
      AND contributor.churchId = member.churchId
     WHERE member.churchId = ?
       AND contributor.memberNumber LIKE ?
     ORDER BY contributor.memberNumber ASC`,
    [churchId, `${MEMBER_PREFIX}-%`],
  );

  const activeLimit = Math.min(generatedActiveTarget, generatedMembers.length);
  const idsToActivate = [];
  const idsToDeactivate = [];

  for (let index = 0; index < generatedMembers.length; index += 1) {
    const member = generatedMembers[index];
    const shouldBeActive = index < activeLimit;
    if (shouldBeActive && member.status !== 'active') {
      idsToActivate.push(member.id);
    }
    if (!shouldBeActive && member.status !== 'inactive') {
      idsToDeactivate.push(member.id);
    }
  }

  summary.generatedMembersActivated = await updateMemberStatusByIds(
    connection,
    churchId,
    idsToActivate,
    'active',
  );
  summary.generatedMembersDeactivated = await updateMemberStatusByIds(
    connection,
    churchId,
    idsToDeactivate,
    'inactive',
  );
}

async function updateMemberStatusByIds(connection, churchId, ids, status) {
  let updated = 0;
  for (const idsChunk of chunk(ids, 500)) {
    if (idsChunk.length === 0) {
      continue;
    }
    const marks = idsChunk.map(() => '?').join(', ');
    const [result] = await connection.query(
      `UPDATE discipleship_members
       SET status = ?, updatedAt = NOW(6)
       WHERE churchId = ?
         AND id IN (${marks})`,
      [status, churchId, ...idsChunk],
    );
    updated += result.affectedRows || 0;
  }
  return updated;
}

async function getActiveDemoContributors(connection, churchId, target) {
  const [contributors] = await connection.query(
    `SELECT contributor.id, contributor.name, contributor.phone, contributor.memberNumber, contributor.gender
     FROM contributors contributor
     JOIN discipleship_members member
       ON member.contributorId = contributor.id
      AND member.churchId = contributor.churchId
     WHERE contributor.churchId = ?
       AND contributor.memberNumber LIKE ?
       AND member.status = 'active'
     ORDER BY contributor.memberNumber ASC
     LIMIT ?`,
    [churchId, `${MEMBER_PREFIX}-%`, target],
  );

  if (contributors.length < target) {
    throw new Error(
      `Only ${contributors.length} active Agape demo contributors are available; expected ${target}.`,
    );
  }

  return contributors;
}

async function ensureDemoGroups(connection, churchId, summary) {
  const [existingGroups] = await connection.query(
    `SELECT id, name
     FROM discipleship_groups
     WHERE churchId = ?
       AND name IN (${GROUP_DEFINITIONS.map(() => '?').join(', ')})`,
    [churchId, ...GROUP_DEFINITIONS.map(([name]) => name)],
  );

  const existingByName = new Map(existingGroups.map((row) => [row.name, row]));
  const now = kenyaTimestamp(kenyaDateToday(), 12 * 3600);
  const groupsToInsert = GROUP_DEFINITIONS.filter(
    ([name]) => !existingByName.has(name),
  ).map(([name, description]) => ({
    id: randomUUID(),
    churchId,
    name,
    description,
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  }));

  summary.groupsCreated = await bulkInsert(
    connection,
    'discipleship_groups',
    [
      'id',
      'churchId',
      'name',
      'description',
      'isActive',
      'createdAt',
      'updatedAt',
    ],
    groupsToInsert,
  );

  const [groups] = await connection.query(
    `SELECT id, name
     FROM discipleship_groups
     WHERE churchId = ?
       AND name IN (${GROUP_DEFINITIONS.map(() => '?').join(', ')})
     ORDER BY name ASC`,
    [churchId, ...GROUP_DEFINITIONS.map(([name]) => name)],
  );

  return groups;
}

async function ensureDemoMemberships(
  connection,
  churchId,
  contributors,
  memberLinks,
  groups,
  summary,
) {
  const memberIds = contributors
    .map((contributor) => memberLinks.get(contributor.id))
    .filter(Boolean);
  const existingMembershipRows = await selectByChunks(
    connection,
    `SELECT memberId, groupId
     FROM discipleship_memberships
     WHERE churchId = ? AND`,
    churchId,
    memberIds,
    'memberId',
  );
  const existingKeys = new Set(
    existingMembershipRows.map((row) => `${row.memberId}:${row.groupId}`),
  );
  const membershipByMemberId = new Map(
    existingMembershipRows.map((row) => [row.memberId, row.groupId]),
  );

  const rowsToInsert = [];
  const now = kenyaTimestamp(kenyaDateToday(), 12 * 3600);

  for (const contributor of contributors) {
    const memberId = memberLinks.get(contributor.id);
    if (!memberId || membershipByMemberId.has(memberId)) {
      continue;
    }

    const seq = sequenceFromMemberNumber(contributor.memberNumber);
    const group = groups[(seq * 5) % groups.length];
    const key = `${memberId}:${group.id}`;
    if (existingKeys.has(key)) {
      membershipByMemberId.set(memberId, group.id);
      continue;
    }

    rowsToInsert.push({
      id: randomUUID(),
      churchId,
      memberId,
      groupId: group.id,
      createdAt: now,
    });
    existingKeys.add(key);
    membershipByMemberId.set(memberId, group.id);
  }

  summary.membershipsCreated = await bulkInsert(
    connection,
    'discipleship_memberships',
    ['id', 'churchId', 'memberId', 'groupId', 'createdAt'],
    rowsToInsert,
  );

  return membershipByMemberId;
}

async function seedDailyContributions(
  connection,
  church,
  funds,
  contributors,
  memberLinks,
  memberships,
  options,
  summary,
) {
  await collectExistingDailySummary(connection, options, summary);

  if (
    summary.existingDailyContributions > 0 &&
    !options.refreshDate &&
    !options.progressive
  ) {
    summary.skippedDailySeed = true;
    return;
  }

  const internalRequestPrefix = `${demoPaymentPrefix(options.date)}:%`;
  if (options.refreshDate && summary.existingDailyContributions > 0) {
    const [attendanceResult] = await connection.query(
      `DELETE FROM discipleship_attendance
       WHERE churchId = ?
         AND attendanceDate = ?
         AND eventName = ?`,
      [church.id, options.date, ATTENDANCE_EVENT_NAME],
    );
    const [contributionResult] = await connection.query(
      `DELETE FROM contributions
       WHERE churchId = ?
         AND providerRequestId LIKE ?`,
      [church.id, internalRequestPrefix],
    );

    summary.refreshedAttendanceDeleted = attendanceResult.affectedRows || 0;
    summary.refreshedContributionsDeleted =
      contributionResult.affectedRows || 0;
  }

  const plan = calculateDailyPlan(options, contributors, funds, memberships);
  const eligibleEntries = getEligiblePlanEntries(plan, options);
  summary.plannedDailyTotal = plan.targetTotal;
  summary.dueDailyContributions = eligibleEntries.length;
  summary.pendingDailyContributions =
    plan.entries.length - eligibleEntries.length;

  const existingProviderRequestIds = await getExistingDailyProviderRequestIds(
    connection,
    church.id,
    options.date,
  );
  const entriesToCreate = options.progressive
    ? eligibleEntries.filter(
        (entry) => !existingProviderRequestIds.has(entry.providerRequestId),
      )
    : eligibleEntries;
  summary.missingDueContributions = entriesToCreate.length;

  const contributionRows = [];
  const attendanceRows = [];
  const weekday = weekdayName(options.date);

  for (const entry of entriesToCreate) {
    const contributor = entry.contributor;
    const fund = entry.fund;
    const memberId = memberLinks.get(contributor.id);
    if (!memberId) {
      throw new Error(
        `Missing discipleship member link for ${contributor.memberNumber}.`,
      );
    }
    const receivedAt = entry.receivedAt;
    const paymentReference = entry.paymentReference;
    const groupId = memberships.get(memberId) || null;

    contributionRows.push({
      id: randomUUID(),
      churchId: church.id,
      contributorId: contributor.id,
      fundAccountId: fund.id,
      enteredByUserId: null,
      fundAccountName: fund.name,
      amount: entry.amount,
      channel: 'mpesa',
      status: 'confirmed',
      sourceType: 'mpesa_c2b',
      commissionRatePctApplied: 0,
      commissionAmount: 0,
      providerRequestId: entry.providerRequestId,
      paymentReference,
      payerName: contributor.name,
      providerPayerId: contributor.phone,
      notes: `M-Pesa C2B confirmation; account ref: ${fund.code}`,
      receivedAt,
      receiptMessageSent: 0,
      receiptSentAt: null,
      receiptDeliveryStatus: null,
      receiptMessageBody: null,
      createdAt: receivedAt,
      updatedAt: receivedAt,
    });

    attendanceRows.push({
      id: randomUUID(),
      churchId: church.id,
      memberId,
      attendanceDate: options.date,
      weekday,
      attendanceType: 'group',
      groupId,
      eventName: ATTENDANCE_EVENT_NAME,
      markedByUserId: null,
      markedAt: receivedAt,
      createdAt: receivedAt,
    });
  }

  summary.contributionsCreated = await bulkInsert(
    connection,
    'contributions',
    [
      'id',
      'churchId',
      'contributorId',
      'fundAccountId',
      'enteredByUserId',
      'fundAccountName',
      'amount',
      'channel',
      'status',
      'sourceType',
      'commissionRatePctApplied',
      'commissionAmount',
      'providerRequestId',
      'paymentReference',
      'payerName',
      'providerPayerId',
      'notes',
      'receivedAt',
      'receiptMessageSent',
      'receiptSentAt',
      'receiptDeliveryStatus',
      'receiptMessageBody',
      'createdAt',
      'updatedAt',
    ],
    contributionRows,
  );

  summary.attendanceCreated = await bulkInsert(
    connection,
    'discipleship_attendance',
    [
      'id',
      'churchId',
      'memberId',
      'attendanceDate',
      'weekday',
      'attendanceType',
      'groupId',
      'eventName',
      'markedByUserId',
      'markedAt',
      'createdAt',
    ],
    attendanceRows,
  );
}

async function collectExistingDailySummary(connection, options, summary) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
     FROM contributions
     WHERE churchId = ?
       AND providerRequestId LIKE ?`,
    [options.churchId, `${demoPaymentPrefix(options.date)}:%`],
  );

  summary.existingDailyContributions = Number(rows[0]?.count || 0);
  summary.existingDailyTotal = Number(rows[0]?.total || 0);
}

async function getExistingDailyProviderRequestIds(connection, churchId, date) {
  const [rows] = await connection.query(
    `SELECT providerRequestId
     FROM contributions
     WHERE churchId = ?
       AND providerRequestId LIKE ?`,
    [churchId, `${demoPaymentPrefix(date)}:%`],
  );

  return new Set(rows.map((row) => row.providerRequestId).filter(Boolean));
}

function calculateDailyPlan(options, contributors, funds, memberships) {
  const rng = createRng(hashString(`agape:${options.date}`));
  const range = options.maxDailyTotal - options.minDailyTotal;
  const targetTotal =
    Math.round((options.minDailyTotal + rng() * range) / 50) * 50;

  if (contributors.length === 0 || funds.length === 0) {
    return { targetTotal, entries: [] };
  }

  const selected = selectDailyContributors(
    contributors,
    options.dailyContributors,
    rng,
  );
  const rawWeights = selected.map((contributor, index) => {
    const seq = sequenceFromMemberNumber(contributor.memberNumber);
    const base =
      index % 19 === 0
        ? 4600 + rng() * 2500
        : index % 7 === 0
          ? 1900 + rng() * 1800
          : index % 3 === 0
            ? 850 + rng() * 900
            : 250 + rng() * 850;
    return base * (1 + (seq % 9) / 25);
  });
  const rawTotal = rawWeights.reduce((sum, value) => sum + value, 0);
  let amounts = rawWeights.map((value) =>
    Math.max(50, Math.round((value * targetTotal) / rawTotal / 10) * 10),
  );
  const roundedTotal = amounts.reduce((sum, value) => sum + value, 0);
  amounts[amounts.length - 1] += targetTotal - roundedTotal;
  if (amounts[amounts.length - 1] <= 0) {
    amounts[amounts.length - 1] = 50;
  }

  const entries = selected.map((contributor, index) => {
    const seconds =
      7 * 3600 + 30 * 60 + Math.floor(rng() * (13 * 3600 + 45 * 60));
    const sequence = index + 1;
    return {
      sequence,
      contributor,
      amount: amounts[index],
      fund: pickFund(funds, contributor, index, rng),
      groupId: memberships.get(contributor.id) || null,
      secondsFromMidnight: seconds,
      receivedAt: kenyaTimestamp(options.date, seconds),
      providerRequestId: `${demoPaymentPrefix(options.date)}:${String(
        sequence,
      ).padStart(4, '0')}`,
      paymentReference: demoPaymentReference(options.date, sequence),
    };
  });

  return { targetTotal, entries };
}

function getEligiblePlanEntries(plan, options) {
  if (!options.progressive) {
    return plan.entries;
  }

  const now = kenyaTimeNow();
  if (now.date !== options.date) {
    return [];
  }

  return plan.entries.filter(
    (entry) => entry.secondsFromMidnight <= now.secondsFromMidnight,
  );
}

function selectDailyContributors(contributors, count, rng) {
  if (count > contributors.length) {
    throw new Error(
      `Cannot select ${count} daily contributors from ${contributors.length} demo contributors.`,
    );
  }

  const pool = [...contributors];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function pickFund(funds, contributor, index, rng) {
  const code = String(funds[index % funds.length]?.code || '').toLowerCase();
  const weightedCodes = [
    'tithe',
    'offering',
    'sadaka',
    'building',
    'harambee',
    'thanksgiving',
    'general',
  ];
  const seq = sequenceFromMemberNumber(contributor.memberNumber);
  const preferredCode = weightedCodes[(seq + index) % weightedCodes.length];
  const preferred = funds.find((fund) =>
    String(fund.code || fund.name)
      .toLowerCase()
      .includes(preferredCode),
  );
  if (preferred && rng() < 0.72) {
    return preferred;
  }
  if (code && rng() < 0.1) {
    return funds[index % funds.length];
  }
  return funds[Math.floor(rng() * funds.length)];
}

function sequenceFromMemberNumber(memberNumber) {
  const match = String(memberNumber || '').match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function printSummary(options, summary) {
  console.log('');
  console.log('Agape demo seed summary');
  console.log('-----------------------');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'}`);
  console.log(`Church: ${summary.church.name} (${summary.church.slug})`);
  console.log(`Date: ${options.date}`);
  console.log(
    `Daily mode: ${options.progressive ? 'progressive through the day' : 'full day'}`,
  );
  console.log(`Active funds available: ${summary.funds}`);
  console.log(
    `Target members: ${options.memberTarget} total, ${options.activeMemberTarget} active`,
  );
  console.log(
    `Existing before run: ${summary.totalMembersBefore} total, ${summary.activeMembersBefore} active`,
  );
  console.log(
    `Preserved non-generated members: ${summary.nonGeneratedMembers} total, ${summary.nonGeneratedActiveMembers} active`,
  );
  console.log(
    `Generated fill target: ${summary.generatedMemberTarget} total, ${summary.generatedActiveTarget} active`,
  );
  console.log(`Daily contributor target: ${options.dailyContributors}`);
  console.log(`Contributors created: ${summary.contributorsCreated}`);
  console.log(`Discipleship members created: ${summary.membersCreated}`);
  console.log(
    `Generated member status balanced: ${summary.generatedMembersActivated} activated, ${summary.generatedMembersDeactivated} deactivated`,
  );
  if (summary.memberContributorLinksBackfilled) {
    console.log(
      `Member contributor links backfilled: ${summary.memberContributorLinksBackfilled}`,
    );
  }
  console.log(`Member links created: ${summary.linksCreated}`);
  console.log(`Groups created: ${summary.groupsCreated}`);
  console.log(`Memberships created: ${summary.membershipsCreated}`);
  if (
    summary.legacyContributionNotesSanitized ||
    summary.legacyMemberNotesSanitized ||
    summary.legacyGroupDescriptionsSanitized
  ) {
    console.log(
      `Visible legacy markers cleaned: ${summary.legacyContributionNotesSanitized || 0} contribution notes, ${summary.legacyMemberNotesSanitized || 0} member notes, ${summary.legacyGroupDescriptionsSanitized || 0} group descriptions.`,
    );
  }

  if (options.membersOnly) {
    console.log('Daily contribution seeding: skipped (--members-only)');
    return;
  }

  if (summary.skippedDailySeed) {
    console.log(
      `Daily contribution seeding: skipped; ${summary.existingDailyContributions} rows already exist for ${options.date}.`,
    );
    console.log(
      `Existing generated total: KES ${summary.existingDailyTotal.toLocaleString(
        'en-KE',
      )}`,
    );
    console.log('Use --refresh-date to recreate this date only.');
    return;
  }

  if (options.refreshDate) {
    console.log(
      `Refreshed old demo rows: ${summary.refreshedContributionsDeleted} contributions, ${summary.refreshedAttendanceDeleted} attendance records.`,
    );
  }

  console.log(
    `Planned daily total: KES ${summary.plannedDailyTotal.toLocaleString(
      'en-KE',
    )}`,
  );
  if (options.progressive) {
    console.log(
      `Due now: ${summary.dueDailyContributions} contributions; pending later: ${summary.pendingDailyContributions}.`,
    );
  }
  console.log(`Contributions created: ${summary.contributionsCreated}`);
  console.log(`Attendance records created: ${summary.attendanceCreated}`);
}

main().catch((error) => {
  console.error('');
  console.error('Agape demo seed failed');
  console.error('----------------------');
  console.error(error.message || error);
  process.exitCode = 1;
});
