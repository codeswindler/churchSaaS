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

@Entity('discipleship_member_aliases')
@Index(['memberId', 'normalizedAlias'], { unique: true })
@Index(['churchId', 'normalizedAlias'])
export class DiscipleshipMemberAlias {
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

  @ManyToOne(() => Contributor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contributorId' })
  contributor: Contributor | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  contributorId: string | null;

  @Column({ type: 'varchar', length: 180 })
  alias: string;

  @Column({ type: 'varchar', length: 180 })
  normalizedAlias: string;

  @Column({ type: 'varchar', length: 30 })
  source: string;

  @CreateDateColumn()
  createdAt: Date;
}
