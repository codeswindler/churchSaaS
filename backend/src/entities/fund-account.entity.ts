import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Church } from './church.entity';
import { Contribution } from './contribution.entity';

@Entity('fund_accounts')
@Index(['churchId', 'code'], { unique: true })
export class FundAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, (church) => church.fundAccounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /**
   * Alternative account references that should resolve to this fund account.
   * Lets contributors type "TITHES", "zaka" or a misspelling as their M-Pesa
   * account reference and still be matched instead of falling through to the
   * fallback account. Matching is case/punctuation-insensitive.
   */
  @Column({ type: 'simple-array', nullable: true })
  aliases: string[] | null;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Marks the account that receives M-Pesa payments whose account reference
   * does not match any configured fund account. Exactly one account per church
   * should carry this flag. Replaces the previous hardcoded `code === 'general'`
   * sentinel so a church can nominate any account as its fallback.
   */
  @Column({ default: false })
  isFallback: boolean;

  @Column({ type: 'datetime', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  archivedByUserId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  archiveReason: string | null;

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  targetAmount: number | null;

  @Column({ type: 'text' })
  receiptTemplate: string;

  @OneToMany(() => Contribution, (contribution) => contribution.fundAccount)
  contributions: Contribution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
