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

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @Column({ type: 'text' })
  receiptTemplate: string;

  @OneToMany(() => Contribution, (contribution) => contribution.fundAccount)
  contributions: Contribution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
