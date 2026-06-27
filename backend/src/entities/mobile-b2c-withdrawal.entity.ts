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
import { FundAccount } from './fund-account.entity';

export enum MobileB2cWithdrawalStatus {
  CREATED = 'created',
  SUBMITTED = 'submitted',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  TIMED_OUT = 'timed_out',
}

@Entity('mobile_b2c_withdrawals')
@Index('IDX_mobile_b2c_church_created', ['churchId', 'createdAt'])
@Index('IDX_mobile_b2c_church_status_created', [
  'churchId',
  'status',
  'createdAt',
])
@Index('IDX_mobile_b2c_originator', ['originatorConversationId'])
@Index('IDX_mobile_b2c_conversation', ['conversationId'])
export class MobileB2cWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  requestedByUserId: string | null;

  @ManyToOne(() => FundAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fundAccountId' })
  fundAccount: FundAccount | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fundAccountId: string | null;

  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 180, nullable: true })
  recipientName: string | null;

  @Column({ type: 'varchar', length: 255 })
  remarks: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  occasion: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: MobileB2cWithdrawalStatus.CREATED,
  })
  status: MobileB2cWithdrawalStatus;

  @Column({ type: 'varchar', length: 80, nullable: true })
  resultCode: string | null;

  @Column({ type: 'text', nullable: true })
  resultDesc: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  originatorConversationId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  transactionId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
