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

export enum ChurchNotificationType {
  FUND_DISPLAY_APPROVAL_REQUESTED = 'fund_display_approval_requested',
}

@Entity('church_notifications')
@Index(['churchId', 'recipientUserId', 'isRead'])
export class ChurchNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => ChurchUser, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'recipientUserId' })
  recipientUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  recipientUserId: string | null;

  @Column({ type: 'varchar', length: 80 })
  type: ChurchNotificationType;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entityType: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actionUrl: string | null;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
