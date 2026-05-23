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

export interface CongregationServiceTime {
  id?: string;
  label: string;
  time: string;
  location?: string | null;
}

export interface CongregationEvent {
  id?: string;
  title: string;
  date?: string | null;
  time?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export interface CongregationMassProgram {
  id?: string;
  title: string;
  day?: string | null;
  time?: string | null;
  details?: string | null;
}

export interface CongregationDailyVerse {
  id?: string;
  date?: string | null;
  reference?: string | null;
  version?: string | null;
  versionLabel?: string | null;
  text: string;
}

export interface CongregationSermon {
  id?: string;
  title: string;
  date?: string | null;
  speaker?: string | null;
  summary?: string | null;
  mediaUrl?: string | null;
  imageUrl?: string | null;
}

export interface CongregationFundDisplay {
  id?: string;
  title?: string | null;
  description?: string | null;
  fundAccountId: string;
  startDate: string;
  endMode?: 'to_date' | 'static' | null;
  endDate?: string | null;
  isActive?: boolean | null;
}

export interface CongregationGalleryImage {
  id?: string;
  title?: string | null;
  imageUrl: string;
  isActive?: boolean | null;
  isDefault?: boolean | null;
}

@Entity('church_congregation_pages')
export class ChurchCongregationPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Church, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @Column({ unique: true })
  churchId: string;

  @Column({ default: true })
  isPublished: boolean;

  @Column({ type: 'varchar', length: 180, nullable: true })
  heroTitle: string | null;

  @Column({ type: 'text', nullable: true })
  welcomeMessage: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  verseReference: string | null;

  @Column({ type: 'text', nullable: true })
  verseText: string | null;

  @Column({ type: 'simple-json', nullable: true })
  dailyVerses: CongregationDailyVerse[] | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  featuredImageUrl: string | null;

  @Column({ type: 'simple-json', nullable: true })
  serviceTimes: CongregationServiceTime[] | null;

  @Column({ type: 'simple-json', nullable: true })
  events: CongregationEvent[] | null;

  @Column({ type: 'simple-json', nullable: true })
  massPrograms: CongregationMassProgram[] | null;

  @Column({ type: 'simple-json', nullable: true })
  sermons: CongregationSermon[] | null;

  @Column({ type: 'simple-json', nullable: true })
  fundDisplays: CongregationFundDisplay[] | null;

  @Column({ type: 'simple-json', nullable: true })
  galleryImages: CongregationGalleryImage[] | null;

  @Column({ type: 'text', nullable: true })
  contactNote: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
