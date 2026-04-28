import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Church } from './church.entity';

export enum ChurchUserRole {
  PRIEST = 'priest',
  TREASURER = 'treasurer',
  SECRETARY = 'secretary',
}

@Entity('church_users')
export class ChurchUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, (church) => church.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', length: 120, unique: true, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 30, unique: true, nullable: true })
  phone: string | null;

  @Column()
  passwordHash: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: ChurchUserRole.TREASURER,
  })
  role: ChurchUserRole;

  @Column({ type: 'simple-json', nullable: true })
  permissionOverrides: string[] | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
