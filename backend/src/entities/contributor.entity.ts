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

@Entity('contributors')
@Index(['churchId', 'phone'])
export class Contributor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, (church) => church.contributors, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  memberNumber: string | null;

  @OneToMany(() => Contribution, (contribution) => contribution.contributor)
  contributions: Contribution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
