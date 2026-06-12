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
import { Contributor } from './contributor.entity';
import { DiscipleshipMember } from './discipleship-member.entity';

@Entity('discipleship_member_contributors')
@Index(['churchId', 'contributorId'], { unique: true })
@Index(['memberId', 'contributorId'], { unique: true })
export class DiscipleshipMemberContributor {
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

  @ManyToOne(() => Contributor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contributorId' })
  contributor: Contributor;

  @Column()
  contributorId: string;

  @Column({ type: 'varchar', length: 40 })
  matchMethod: string;

  @Column({ type: 'boolean', default: true })
  isConfirmed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
