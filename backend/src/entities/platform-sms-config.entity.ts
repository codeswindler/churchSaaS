import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export const PLATFORM_SMS_CONFIG_ID = 'platform';

@Entity('platform_sms_config')
export class PlatformSmsConfig {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  smsPartnerId: string | null;

  @Column({ type: 'text', nullable: true })
  smsApiKey: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  smsShortcode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smsBaseUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
