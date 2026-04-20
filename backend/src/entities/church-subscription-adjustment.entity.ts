import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Church } from './church.entity';
import { ChurchSubscription } from './church-subscription.entity';
import { PlatformUser } from './platform-user.entity';

export enum ChurchSubscriptionAdjustmentAction {
  ADD_DAYS = 'add_days',
  SUBTRACT_DAYS = 'subtract_days',
  ACTIVATE = 'activate',
  SUSPEND = 'suspend',
  REACTIVATE = 'reactivate',
}

@Entity('church_subscription_adjustments')
export class ChurchSubscriptionAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(
    () => ChurchSubscription,
    (subscription) => subscription.adjustments,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'subscriptionId' })
  subscription: ChurchSubscription;

  @Column()
  subscriptionId: string;

  @ManyToOne(() => PlatformUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performedByPlatformUserId' })
  performedByPlatformUser: PlatformUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  performedByPlatformUserId: string | null;

  @Column({
    type: 'enum',
    enum: ChurchSubscriptionAdjustmentAction,
  })
  actionType: ChurchSubscriptionAdjustmentAction;

  @Column({ type: 'int', default: 0 })
  daysDelta: number;

  @Column({ type: 'timestamp', nullable: true })
  beforeExpiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  afterExpiresAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
