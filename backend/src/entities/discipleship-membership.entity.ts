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
import { DiscipleshipGroup } from './discipleship-group.entity';
import { DiscipleshipMember } from './discipleship-member.entity';

@Entity('discipleship_memberships')
@Index(['churchId', 'memberId'])
@Index(['memberId', 'groupId'], { unique: true })
export class DiscipleshipMembership {
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

  @ManyToOne(() => DiscipleshipGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: DiscipleshipGroup;

  @Column()
  groupId: string;

  @CreateDateColumn()
  createdAt: Date;
}
