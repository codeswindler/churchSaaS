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
import { DiscipleshipMember } from './discipleship-member.entity';

export enum DiscipleshipMatchCandidateStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DISMISSED = 'dismissed',
}

@Entity('discipleship_match_candidates')
@Index(['churchId', 'status'])
@Index(['contributorId', 'candidateMemberId'], { unique: true })
export class DiscipleshipMatchCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => Contributor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contributorId' })
  contributor: Contributor;

  @Column()
  contributorId: string;

  @ManyToOne(() => DiscipleshipMember, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateMemberId' })
  candidateMember: DiscipleshipMember;

  @Column()
  candidateMemberId: string;

  @Column({ type: 'varchar', length: 180 })
  observedName: string;

  @Column({ type: 'varchar', length: 180 })
  normalizedName: string;

  @Column({ type: 'varchar', length: 120 })
  matchReason: string;

  @Column({ type: 'int', default: 0 })
  matchScore: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: DiscipleshipMatchCandidateStatus.PENDING,
  })
  status: DiscipleshipMatchCandidateStatus;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedByUserId' })
  reviewedByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
