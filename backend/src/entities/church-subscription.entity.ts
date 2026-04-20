import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Church } from './church.entity';
import { ChurchSubscriptionAdjustment } from './church-subscription-adjustment.entity';

export enum ChurchSubscriptionStatus {
  ACTIVE = 'active',
  GRACE = 'grace',
  SUSPENDED = 'suspended',
}

@Entity('church_subscriptions')
export class ChurchSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, (church) => church.subscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  planCode: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  planName: string | null;

  @Column({ type: 'timestamp' })
  startsAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp' })
  graceEndsAt: Date;

  @Column({
    type: 'enum',
    enum: ChurchSubscriptionStatus,
    default: ChurchSubscriptionStatus.ACTIVE,
  })
  status: ChurchSubscriptionStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(
    () => ChurchSubscriptionAdjustment,
    (adjustment) => adjustment.subscription,
  )
  adjustments: ChurchSubscriptionAdjustment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
