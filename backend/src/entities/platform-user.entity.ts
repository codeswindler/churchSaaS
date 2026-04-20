import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PlatformUserRole {
  PLATFORM_ADMIN = 'platform_admin',
}

@Entity('platform_users')
export class PlatformUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
    type: 'enum',
    enum: PlatformUserRole,
    default: PlatformUserRole.PLATFORM_ADMIN,
  })
  role: PlatformUserRole;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
