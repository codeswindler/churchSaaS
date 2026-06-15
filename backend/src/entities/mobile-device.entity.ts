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

export enum MobileDevicePlatform {
  ANDROID = 'android',
}

@Entity('mobile_devices')
@Index(['churchId', 'churchUserId', 'isActive'])
@Index(['fcmToken'], { unique: true })
export class MobileDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => ChurchUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchUserId' })
  churchUser: ChurchUser;

  @Column()
  churchUserId: string;

  @Column({ type: 'varchar', length: 512 })
  fcmToken: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: MobileDevicePlatform.ANDROID,
  })
  platform: MobileDevicePlatform;

  @Column({ type: 'varchar', length: 80, nullable: true })
  appVersion: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  deviceName: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deactivatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
