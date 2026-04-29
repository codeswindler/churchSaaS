import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChurchSubscription } from './church-subscription.entity';
import { ChurchUser } from './church-user.entity';
import { Contribution } from './contribution.entity';
import { Contributor } from './contributor.entity';
import { FundAccount } from './fund-account.entity';

export enum ChurchStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('churches')
export class Church {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  smsPartnerId: string | null;

  @Column({ type: 'text', nullable: true })
  smsApiKey: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  smsShortcode: string | null;

  @Column({ type: 'simple-json', nullable: true })
  smsShortcodes: string[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smsBaseUrl: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mpesaEnvironment: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mpesaConsumerKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mpesaConsumerSecret: string | null;

  @Column({ type: 'text', nullable: true })
  mpesaPasskey: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  mpesaShortcode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mpesaCallbackUrl: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  commissionRatePct: number;

  @Column({ type: 'simple-json', nullable: true })
  enabledFeatures: string[] | null;

  @Column({
    type: 'enum',
    enum: ChurchStatus,
    default: ChurchStatus.ACTIVE,
  })
  status: ChurchStatus;

  @OneToMany(() => ChurchUser, (user) => user.church)
  users: ChurchUser[];

  @OneToMany(() => ChurchSubscription, (subscription) => subscription.church)
  subscriptions: ChurchSubscription[];

  @OneToMany(() => FundAccount, (fundAccount) => fundAccount.church)
  fundAccounts: FundAccount[];

  @OneToMany(() => Contributor, (contributor) => contributor.church)
  contributors: Contributor[];

  @OneToMany(() => Contribution, (contribution) => contribution.church)
  contributions: Contribution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
