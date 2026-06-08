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
import { ChurchUser } from './church-user.entity';
import { DiscipleshipGroup } from './discipleship-group.entity';
import { DiscipleshipMember } from './discipleship-member.entity';

export enum DiscipleshipAttendanceType {
  SERVICE = 'service',
  GROUP = 'group',
}

@Entity('discipleship_attendance')
@Index(['churchId', 'attendanceDate'])
@Index(['memberId', 'attendanceDate'])
export class DiscipleshipAttendance {
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
  attendanceDate: string;

  @Column({ type: 'varchar', length: 20 })
  weekday: string;

  @Column({ type: 'varchar', length: 20 })
  attendanceType: DiscipleshipAttendanceType;

  @ManyToOne(() => DiscipleshipGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'groupId' })
  group: DiscipleshipGroup | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  groupId: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  eventName: string | null;

  @ManyToOne(() => ChurchUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'markedByUserId' })
  markedByUser: ChurchUser | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  markedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  markedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
