USE church_system;

SET @church_id := '55f91f65-2ab1-44fb-ae65-d370650a5334';
SET @target_total := 5900000.00;
SET @start_date := DATE('2026-01-01');
SET @end_date := DATE('2026-05-05');

START TRANSACTION;

DELETE FROM contributions
WHERE churchId = @church_id
  AND notes LIKE 'Demo seed: ATG analytics%';

DELETE FROM contributors
WHERE churchId = @church_id
  AND (
    memberNumber LIKE 'ATG-DEMO-%'
    OR memberNumber LIKE 'ATG-SEED-%'
  );

DROP TEMPORARY TABLE IF EXISTS
  tmp_seed_funds,
  tmp_seed_names,
  tmp_seed_contributors,
  tmp_seed_days,
  tmp_seed_raw,
  tmp_seed_rows;

CREATE TEMPORARY TABLE tmp_seed_funds (
  fund_no int PRIMARY KEY,
  code varchar(40),
  fundAccountId varchar(36),
  fundAccountName varchar(120)
);

INSERT INTO tmp_seed_funds VALUES
(1, 'tithe',    '4cde284d-c741-4e62-bb7c-ee82ccbeb533', 'Tithe'),
(2, 'offering', 'fb82c510-acac-4035-bd42-bc7fab995a99', 'Offering'),
(3, 'wedding',  '32badcf1-e2e3-4a5a-a085-520720b5f9e0', 'WEDDING'),
(4, 'harambee', '41c25339-96d3-46f6-b461-1d4c65e47c3d', 'Harambee'),
(5, 'general',  '7aea78b6-5b45-4661-ae99-297c503bd4c9', 'General'),
(6, 'funeral',  '6da889cd-37e6-47a4-8574-d0858b76304c', 'FUNERAL');

CREATE TEMPORARY TABLE tmp_seed_names (
  seq_no int PRIMARY KEY,
  name varchar(255),
  gender varchar(20)
);

INSERT INTO tmp_seed_names VALUES
(1, 'Grace Wambui', 'female'),
(2, 'Peter Mwangi', 'male'),
(3, 'Faith Njeri', 'female'),
(4, 'John Otieno', 'male'),
(5, 'Mercy Achieng', 'female'),
(6, 'Samuel Kiptoo', 'male'),
(7, 'Mary Wanjiku', 'female'),
(8, 'Daniel Mutua', 'male'),
(9, 'Esther Wairimu', 'female'),
(10, 'Joseph Kariuki', 'male'),
(11, 'Lucy Atieno', 'female'),
(12, 'David Maina', 'male'),
(13, 'Jane Muthoni', 'female'),
(14, 'George Ochieng', 'male'),
(15, 'Agnes Nyambura', 'female'),
(16, 'Paul Karanja', 'male'),
(17, 'Ruth Chebet', 'female'),
(18, 'Simon Njoroge', 'male'),
(19, 'Caroline Jepkoech', 'female'),
(20, 'Moses Kamau', 'male'),
(21, 'Ann Waithera', 'female'),
(22, 'Francis Omondi', 'male'),
(23, 'Beatrice Wanjiru', 'female'),
(24, 'Isaac Kimani', 'male'),
(25, 'Eunice Moraa', 'female'),
(26, 'Martin Onyango', 'male'),
(27, 'Irene Naliaka', 'female'),
(28, 'Patrick Mbugua', 'male'),
(29, 'Rose Nyokabi', 'female'),
(30, 'Stephen Langat', 'male'),
(31, 'Catherine Wairimu', 'female'),
(32, 'Brian Ouma', 'male'),
(33, 'Lydia Mumbi', 'female'),
(34, 'Anthony Njuguna', 'male'),
(35, 'Naomi Wangari', 'female'),
(36, 'Michael Mutiso', 'male'),
(37, 'Sarah Cherono', 'female'),
(38, 'Kevin Odhiambo', 'male'),
(39, 'Elizabeth Nyambura', 'female'),
(40, 'James Macharia', 'male'),
(41, 'Rebecca Akinyi', 'female'),
(42, 'Philip Bett', 'male'),
(43, 'Hannah Makena', 'female'),
(44, 'Robert Wekesa', 'male'),
(45, 'Joyce Njeri', 'female'),
(46, 'Charles Githinji', 'male'),
(47, 'Diana Jepchirchir', 'female'),
(48, 'Andrew Muli', 'male'),
(49, 'Monica Wanjala', 'female'),
(50, 'Victor Kiprono', 'male'),
(51, 'Teresa Nyawira', 'female'),
(52, 'Emmanuel Barasa', 'male'),
(53, 'Susan Muthoni', 'female'),
(54, 'Nicholas Kibet', 'male'),
(55, 'Purity Wambui', 'female'),
(56, 'Collins Otieno', 'male'),
(57, 'Janet Nekesa', 'female'),
(58, 'Timothy Gakuru', 'male'),
(59, 'Priscah Moraa', 'female'),
(60, 'Alex Njenga', 'male'),
(61, 'Miriam Chepkemoi', 'female'),
(62, 'Edwin Munene', 'male'),
(63, 'Florence Anyango', 'female'),
(64, 'Dennis Wainaina', 'male'),
(65, 'Margaret Wanjiru', 'female'),
(66, 'Kenneth Kipchumba', 'male'),
(67, 'Pauline Mbithe', 'female'),
(68, 'Gabriel Muriithi', 'male'),
(69, 'Alice Naliaka', 'female'),
(70, 'Leonard Omollo', 'male'),
(71, 'Christine Njoki', 'female'),
(72, 'Vincent Mutua', 'male'),
(73, 'Millicent Achieng', 'female'),
(74, 'Julius Koech', 'male'),
(75, 'Veronica Wairimu', 'female'),
(76, 'Eric Kariuki', 'male'),
(77, 'Nancy Chebet', 'female'),
(78, 'Oscar Oloo', 'male'),
(79, 'Dorcas Wangui', 'female'),
(80, 'Benjamin Mwangi', 'male');

CREATE TEMPORARY TABLE tmp_seed_contributors AS
SELECT
  seq_no,
  UUID() AS id,
  @church_id AS churchId,
  name,
  CONCAT('2547', LPAD(11000000 + MOD(seq_no * 7919, 8899999), 8, '0')) AS phone,
  CONCAT('ATG-SEED-', LPAD(seq_no, 3, '0')) AS memberNumber,
  gender
FROM tmp_seed_names;

INSERT INTO contributors (
  id,
  churchId,
  name,
  phone,
  memberNumber,
  gender,
  createdAt,
  updatedAt
)
SELECT
  id,
  churchId,
  name,
  phone,
  memberNumber,
  gender,
  NOW(6),
  NOW(6)
FROM tmp_seed_contributors;

CREATE TEMPORARY TABLE tmp_seed_days AS
SELECT
  seed_date,
  CASE
    WHEN seed_date IN (@start_date, @end_date) THEN 2
    WHEN DAYOFWEEK(seed_date) = 1 THEN 5 + MOD(DAYOFYEAR(seed_date), 4)
    WHEN DAYOFWEEK(seed_date) = 7 AND MOD(WEEK(seed_date), 2) = 0 THEN 3 + MOD(DAYOFYEAR(seed_date), 2)
    WHEN DAYOFWEEK(seed_date) = 4 AND MOD(DAYOFYEAR(seed_date), 3) = 0 THEN 2
    WHEN DAYOFWEEK(seed_date) = 6 AND MOD(DAYOFYEAR(seed_date), 5) = 0 THEN 1
    ELSE 0
  END AS txn_count,
  CASE
    WHEN seed_date IN (@start_date, @end_date) THEN 0.90
    WHEN DAYOFWEEK(seed_date) = 1 THEN 1.55
    WHEN DAYOFWEEK(seed_date) = 7 THEN 1.25
    WHEN DAYOFWEEK(seed_date) = 4 THEN 0.85
    ELSE 0.65
  END AS day_weight
FROM (
  SELECT DATE_ADD(@start_date, INTERVAL seq DAY) AS seed_date
  FROM seq_0_to_400
  WHERE DATE_ADD(@start_date, INTERVAL seq DAY) <= @end_date
) seed_dates;

CREATE TEMPORARY TABLE tmp_seed_raw AS
SELECT
  ROW_NUMBER() OVER (ORDER BY seed_date, tx_no) AS row_no,
  seed_date,
  tx_no,
  CASE
    WHEN bucket < 36 THEN 1
    WHEN bucket < 68 THEN 2
    WHEN bucket < 84 THEN 3
    WHEN bucket < 92 THEN 4
    WHEN bucket < 97 THEN 5
    ELSE 6
  END AS fund_no,
  day_weight * CASE
    WHEN bucket < 36 THEN 18000 + MOD(DAYOFYEAR(seed_date) * 137 + tx_no * 991, 23000)
    WHEN bucket < 68 THEN 11000 + MOD(DAYOFYEAR(seed_date) * 149 + tx_no * 733, 18000)
    WHEN bucket < 84 THEN 15000 + MOD(DAYOFYEAR(seed_date) * 181 + tx_no * 577, 26000)
    WHEN bucket < 92 THEN 8000 + MOD(DAYOFYEAR(seed_date) * 113 + tx_no * 431, 16000)
    WHEN bucket < 97 THEN 5000 + MOD(DAYOFYEAR(seed_date) * 101 + tx_no * 389, 9000)
    ELSE 6000 + MOD(DAYOFYEAR(seed_date) * 97 + tx_no * 353, 11000)
  END AS raw_amount
FROM (
  SELECT
    d.seed_date,
    d.day_weight,
    n.seq AS tx_no,
    MOD(DAYOFYEAR(d.seed_date) * 17 + n.seq * 23, 100) AS bucket
  FROM tmp_seed_days d
  JOIN seq_1_to_8 n ON n.seq <= d.txn_count
  WHERE d.txn_count > 0
) seeded_transactions;

SELECT @raw_total := SUM(raw_amount)
FROM tmp_seed_raw;

CREATE TEMPORARY TABLE tmp_seed_rows AS
SELECT
  r.row_no,
  f.code,
  f.fundAccountId,
  f.fundAccountName,
  CAST(ROUND((r.raw_amount * @target_total / @raw_total) / 10, 0) * 10 AS DECIMAL(12,2)) AS amount,
  DATE_ADD(r.seed_date, INTERVAL (
    CASE WHEN DAYOFWEEK(r.seed_date) = 1 THEN 8 * 3600 ELSE 9 * 3600 END
    + MOD(DAYOFYEAR(r.seed_date) * 997 + r.tx_no * 619, 9 * 3600)
  ) SECOND) AS receivedAt,
  1 + MOD(r.row_no * 7, 80) AS contributor_seq
FROM tmp_seed_raw r
JOIN tmp_seed_funds f ON f.fund_no = r.fund_no;

SELECT
  @seed_diff := @target_total - SUM(amount),
  @last_row := MAX(row_no)
FROM tmp_seed_rows;

UPDATE tmp_seed_rows
SET amount = amount + @seed_diff
WHERE row_no = @last_row;

INSERT INTO contributions (
  id,
  churchId,
  contributorId,
  fundAccountId,
  enteredByUserId,
  fundAccountName,
  amount,
  channel,
  status,
  sourceType,
  commissionRatePctApplied,
  commissionAmount,
  providerRequestId,
  paymentReference,
  notes,
  receivedAt,
  receiptMessageSent,
  receiptSentAt,
  receiptDeliveryStatus,
  receiptMessageBody,
  createdAt,
  updatedAt
)
SELECT
  UUID(),
  @church_id,
  c.id,
  r.fundAccountId,
  NULL,
  r.fundAccountName,
  r.amount,
  'mpesa',
  'confirmed',
  'mpesa_c2b',
  COALESCE(ch.commissionRatePct, 0),
  ROUND(r.amount * COALESCE(ch.commissionRatePct, 0) / 100, 2),
  NULL,
  CONCAT('ATG', DATE_FORMAT(r.receivedAt, '%y%m%d'), LPAD(r.row_no, 5, '0')),
  CONCAT('Demo seed: ATG analytics; simulated M-Pesa C2B; account=', r.code),
  r.receivedAt,
  0,
  NULL,
  NULL,
  NULL,
  r.receivedAt,
  r.receivedAt
FROM tmp_seed_rows r
JOIN tmp_seed_contributors c ON c.seq_no = r.contributor_seq
JOIN churches ch ON ch.id = @church_id;

SELECT
  COUNT(*) AS txns,
  SUM(amount) AS total,
  MIN(receivedAt) AS first_txn,
  MAX(receivedAt) AS last_txn
FROM contributions
WHERE churchId = @church_id
  AND notes LIKE 'Demo seed: ATG analytics%';

SELECT
  fundAccountName,
  COUNT(*) AS txns,
  SUM(amount) AS total
FROM contributions
WHERE churchId = @church_id
  AND notes LIKE 'Demo seed: ATG analytics%'
GROUP BY fundAccountName
ORDER BY total DESC;

COMMIT;
