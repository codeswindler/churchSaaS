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

export enum DiscipleshipDuplicateReviewStatus {
  SKIPPED = 'skipped',
  MERGED = 'merged',
}

@Entity('discipleship_duplicate_reviews')
@Index(['churchId', 'clusterKey'], { unique: true })
@Index(['churchId', 'status'])
export class DiscipleshipDuplicateReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @Column({ type: 'varchar', length: 500 })
  clusterKey: string;

  @Column({ type: 'text' })
  memberIdsSnapshot: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  status: DiscipleshipDuplicateReviewStatus;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedByUserId' })
  reviewedByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedByUserId: string | null;

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
