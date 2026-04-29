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
import { SmsAddressBook } from './sms-address-book.entity';

@Entity('sms_address_book_contacts')
@Index(['churchId', 'normalizedPhone'])
@Index(['addressBookId', 'normalizedPhone'])
export class SmsAddressBookContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column()
  churchId: string;

  @ManyToOne(() => SmsAddressBook, (book) => book.contacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'addressBookId' })
  addressBook: SmsAddressBook;

  @Column()
  addressBookId: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 40 })
  normalizedPhone: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sourceLabel: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
