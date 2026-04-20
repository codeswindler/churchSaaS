import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Church } from './church.entity';
import { ChurchUser } from './church-user.entity';
import { Contributor } from './contributor.entity';
import { FundAccount } from './fund-account.entity';

export enum ContributionChannel {
  MPESA = 'mpesa',
  MANUAL_CASH = 'manual_cash',
}

export enum ContributionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity('contributions')
export class Contribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, (church) => church.contributions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => Contributor, (contributor) => contributor.contributions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'contributorId' })
  contributor: Contributor | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  contributorId: string | null;

  @ManyToOne(() => FundAccount, (fundAccount) => fundAccount.contributions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'fundAccountId' })
  fundAccount: FundAccount | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fundAccountId: string | null;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'enteredByUserId' })
  enteredByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  enteredByUserId: string | null;

  @Column({ type: 'varchar', length: 120 })
  fundAccountName: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: ContributionChannel,
  })
  channel: ContributionChannel;

  @Column({
    type: 'enum',
    enum: ContributionStatus,
    default: ContributionStatus.PENDING,
  })
  status: ContributionStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerRequestId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paymentReference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  receiptMessageSent: boolean;

  @Column({ type: 'timestamp', nullable: true })
  receiptSentAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  receiptDeliveryStatus: string | null;

  @Column({ type: 'text', nullable: true })
  receiptMessageBody: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
