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

export enum DiscipleshipMemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('discipleship_members')
@Index(['churchId', 'fullName'])
@Index(['churchId', 'phone'])
@Index(['churchId', 'contributorId'])
export class DiscipleshipMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @Column({ type: 'varchar', length: 180 })
  fullName: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'date', nullable: true })
  enrollmentDate: string | null;

  @Column({ type: 'boolean', nullable: true })
  isFirstTimeAtChurch: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  hasChurchRole: boolean | null;

  @Column({ type: 'text', nullable: true })
  churchRoleNotes: string | null;

  @Column({ type: 'boolean', nullable: true })
  isParent: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  childInSundaySchool: boolean | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: DiscipleshipMemberStatus.ACTIVE,
  })
  status: DiscipleshipMemberStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => Contributor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contributorId' })
  contributor: Contributor | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  contributorId: string | null;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
