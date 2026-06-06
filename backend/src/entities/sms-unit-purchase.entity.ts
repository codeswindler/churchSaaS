import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Church } from './church.entity';
import { ChurchUser } from './church-user.entity';
import { SmsBatch } from './sms-batch.entity';

export enum SmsUnitPurchaseStatus {
  STK_SENT = 'stk_sent',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  SENDING = 'sending',
  SENT = 'sent',
  SEND_FAILED = 'send_failed',
}

@Entity('sms_unit_purchases')
@Index(['churchId', 'createdAt'])
@Index(['checkoutRequestId'])
export class SmsUnitPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => SmsBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batchId' })
  batch: SmsBatch | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  batchId: string | null;

  @Column({ type: 'simple-json' })
  messagePayload: Record<string, any>;

  @Column({ type: 'simple-json' })
  quoteSnapshot: Record<string, any>;

  @Column({ type: 'int', default: 0 })
  recipientCount: number;

  @Column({ type: 'int', default: 0 })
  totalUnits: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  smsUnitRateKes: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountKes: number;

  @Column({ type: 'varchar', length: 30 })
  payerPhone: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  checkoutRequestId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  merchantRequestId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  mpesaReceipt: string | null;

  @Column({ type: 'varchar', length: 40 })
  status: SmsUnitPurchaseStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  statusDescription: string | null;

  @Column({ type: 'simple-json', nullable: true })
  providerRawResponse: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
