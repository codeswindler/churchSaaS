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
import { Contributor } from './contributor.entity';
import { SmsBatch } from './sms-batch.entity';

export enum SmsMessageType {
  RECEIPT = 'receipt',
  BULK = 'bulk',
}

export enum SmsSendStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  FAILED = 'failed',
}

export enum SmsDeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  UNKNOWN = 'unknown',
}

@Entity('sms_outbox')
@Index(['churchId', 'createdAt'])
@Index(['providerMessageId'])
export class SmsOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => SmsBatch, (batch) => batch.messages, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'batchId' })
  batch: SmsBatch | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  batchId: string | null;

  @ManyToOne(() => Contributor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contributorId' })
  contributor: Contributor | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  contributorId: string | null;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  recipientName: string | null;

  @Column({ type: 'varchar', length: 255 })
  recipientMobile: string;

  @Column({ type: 'boolean', default: false })
  isHashedRecipient: boolean;

  @Column({ type: 'varchar', length: 40 })
  messageType: SmsMessageType;

  @Column({ type: 'text' })
  messageBody: string;

  @Column({ type: 'int', default: 1 })
  estimatedUnits: number;

  @Column({ type: 'varchar', length: 40, default: SmsSendStatus.PENDING })
  sendStatus: SmsSendStatus;

  @Column({ type: 'varchar', length: 40, default: SmsDeliveryStatus.PENDING })
  deliveryStatus: SmsDeliveryStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  providerCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerDescription: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deliveryDescription: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  deliveryTat: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveryReportedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  providerRawResponse: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
