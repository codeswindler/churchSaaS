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
import { ChurchUser } from './church-user.entity';
import { SmsOutbox } from './sms-outbox.entity';

export enum SmsBatchAudience {
  ALL_CONTRIBUTORS = 'all_contributors',
  MALE_CONTRIBUTORS = 'male_contributors',
  FEMALE_CONTRIBUTORS = 'female_contributors',
  PASTED_CONTACTS = 'pasted_contacts',
}

@Entity('sms_batches')
export class SmsBatch {
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

  @Column({ type: 'varchar', length: 40 })
  audience: SmsBatchAudience;

  @Column({ type: 'text' })
  messageBody: string;

  @Column({ type: 'int', default: 0 })
  recipientCount: number;

  @Column({ type: 'int', default: 0 })
  totalUnits: number;

  @Column({ type: 'varchar', length: 40, default: 'queued' })
  status: string;

  @OneToMany(() => SmsOutbox, (outbox) => outbox.batch)
  messages: SmsOutbox[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
