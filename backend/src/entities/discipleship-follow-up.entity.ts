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
import { DiscipleshipMember } from './discipleship-member.entity';

export enum DiscipleshipFollowUpStatus {
  OPEN = 'open',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('discipleship_follow_ups')
@Index(['churchId', 'memberId', 'sessionDate'])
@Index(['churchId', 'status', 'nextProposedVisitDate'])
export class DiscipleshipFollowUp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => DiscipleshipMember, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberId' })
  member: DiscipleshipMember;

  @Column()
  memberId: string;

  @Column({ type: 'date' })
  sessionDate: string;

  @Column({ type: 'text', nullable: true })
  discussionSummary: string | null;

  @Column({ type: 'text', nullable: true })
  issueRaised: string | null;

  @Column({ type: 'text', nullable: true })
  proposedSolutions: string | null;

  @Column({ type: 'date', nullable: true })
  nextProposedVisitDate: string | null;

  @Column({ type: 'text', nullable: true })
  nextVisitNotes: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: DiscipleshipFollowUpStatus.OPEN,
  })
  status: DiscipleshipFollowUpStatus;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recordedByUserId' })
  recordedByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  recordedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
