import {
  BadGatewayException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type QueryValue = boolean | number | string | string[] | undefined;

type YouVersionBibleVersion = {
  id: number;
  abbreviation?: string;
  localized_abbreviation?: string;
  title?: string;
  localized_title?: string;
  language_tag?: string;
  copyright_short?: string;
  publisher_url?: string;
  youversion_deep_link?: string;
  language?: {
    iso_639_1?: string;
    name?: string;
  };
};

type YouVersionCollection<T> = {
  data?: T[];
  next_page_token?: string;
  total_size?: number;
};

@Injectable()
export class BibleService {
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('YVP_API_BASE_URL') ||
      'https://api.youversion.com';
  }

  async getVersions(languageRanges: string[], allAvailable = false) {
    const ranges = languageRanges.length
      ? languageRanges
      : this.getDefaultLanguageRanges();
    const versionMap = new Map<number, YouVersionBibleVersion>();

    for (const range of ranges) {
      const versions = await this.getVersionsForLanguageRange(
        range,
        allAvailable,
      );

      versions.forEach((version) => versionMap.set(version.id, version));
    }

    return {
      data: [...versionMap.values()],
      total_size: versionMap.size,
    };
  }

  getChapter(versionId: string, bookId: string, chapter: string) {
    return this.request(
      `/v1/bibles/${encodeURIComponent(versionId)}/books/${encodeURIComponent(
        bookId.toUpperCase(),
      )}/chapters/${encodeURIComponent(chapter)}`,
    );
  }

  getPassage(
    versionId: string,
    passageId: string,
    format: 'html' | 'text' = 'text',
  ) {
    return this.request(
      `/v1/bibles/${encodeURIComponent(versionId)}/passages/${encodeURIComponent(
        passageId,
      )}`,
      {
        format,
        include_headings: false,
        include_notes: false,
      },
    );
  }

  private getDefaultLanguageRanges() {
    return (
      this.configService.get<string>('YVP_LANGUAGE_RANGES') ||
      'en,sw,swh,kik,ki,luo,kln'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private async getVersionsForLanguageRange(
    languageRange: string,
    allAvailable: boolean,
  ) {
    const versions: YouVersionBibleVersion[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.request<
        YouVersionCollection<YouVersionBibleVersion>
      >('/v1/bibles', {
        'language_ranges[]': languageRange,
        page_size: 99,
        page_token: pageToken,
        all_available: allAvailable || undefined,
      });

      versions.push(...(response.data || []));
      pageToken = response.next_page_token;
    } while (pageToken);

    return versions;
  }

  private async request<T>(path: string, query?: Record<string, QueryValue>) {
    const appKey = this.configService.get<string>('YVP_APP_KEY');
    if (!appKey) {
      throw new ServiceUnavailableException(
        'YouVersion Platform app key is not configured',
      );
    }

    const url = this.buildUrl(path, query);

    try {
      const response = await axios.get<T>(url, {
        headers: {
          Accept: 'application/json',
          'X-YVP-App-Key': appKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const message =
          (error.response.data as any)?.message ||
          (error.response.data as any)?.error ||
          'YouVersion request failed';

        if (status === 401) {
          throw new ServiceUnavailableException(
            'YouVersion app key is missing or invalid',
          );
        }

        throw new HttpException(message, status);
      }

      throw new BadGatewayException('Could not reach YouVersion Platform');
    }
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>) {
    const url = new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, item));
        return;
      }

      url.searchParams.set(key, `${value}`);
    });

    return url.toString();
  }
}
