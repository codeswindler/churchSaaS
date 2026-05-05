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
  AND memberNumber LIKE 'ATG-DEMO-%';

DROP TEMPORARY TABLE IF EXISTS
  tmp_seed_funds,
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

CREATE TEMPORARY TABLE tmp_seed_contributors AS
SELECT
  seq AS seq_no,
  UUID() AS id,
  @church_id AS churchId,
  CONCAT('ATG Demo Member ', LPAD(seq, 3, '0')) AS name,
  CONCAT('2547', LPAD(10000000 + seq, 8, '0')) AS phone,
  CONCAT('ATG-DEMO-', LPAD(seq, 3, '0')) AS memberNumber,
  IF(MOD(seq, 2) = 0, 'female', 'male') AS gender
FROM seq_1_to_80;

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
