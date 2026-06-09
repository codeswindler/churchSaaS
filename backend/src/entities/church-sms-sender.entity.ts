import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Church } from './church.entity';
import { SmsSender } from './sms-sender.entity';

@Entity('church_sms_senders')
@Index(['churchId', 'senderId'], { unique: true })
export class ChurchSmsSender {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column({ type: 'varchar', length: 36 })
  churchId: string;

  @ManyToOne(() => SmsSender, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender: SmsSender;

  @Column({ type: 'varchar', length: 36 })
  senderId: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
