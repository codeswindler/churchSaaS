import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BibleService } from './bible.service';

@Controller('bible')
export class BibleController {
  constructor(private readonly bibleService: BibleService) {}

  @Get('versions')
  getVersions(
    @Query('languages') languages?: string | string[],
    @Query('allAvailable') allAvailable?: string,
  ) {
    return this.bibleService.getVersions(
      this.parseLanguageRanges(languages),
      allAvailable === 'true',
    );
  }

  @Get('chapter')
  getChapter(
    @Query('versionId') versionId?: string,
    @Query('bookId') bookId?: string,
    @Query('chapter') chapter?: string,
  ) {
    if (!versionId || !bookId || !chapter) {
      throw new BadRequestException('versionId, bookId and chapter are required');
    }

    return this.bibleService.getChapter(versionId, bookId, chapter);
  }

  @Get('passage')
  getPassage(
    @Query('versionId') versionId?: string,
    @Query('passageId') passageId?: string,
    @Query('format') format?: string,
  ) {
    if (!versionId || !passageId) {
      throw new BadRequestException('versionId and passageId are required');
    }

    return this.bibleService.getPassage(
      versionId,
      passageId,
      format === 'html' ? 'html' : 'text',
    );
  }

  private parseLanguageRanges(languages?: string | string[]) {
    const values = Array.isArray(languages) ? languages : [languages || ''];
    return values
      .flatMap((value) => `${value}`.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
  }
}
