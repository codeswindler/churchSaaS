import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChurchSmsConfig } from '../common/church.utils';

type ResolvedSmsConfig = {
  partnerId: string;
  apiKey: string;
  shortCode: string;
  baseUrl: string;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly partnerId: string;
  private readonly apiKey: string;
  private readonly shortCode: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.partnerId = this.configService.get<string>('ADVANTA_PARTNER_ID') || '';
    this.apiKey = this.configService.get<string>('ADVANTA_API_KEY') || '';
    this.shortCode = this.configService.get<string>('ADVANTA_SHORTCODE') || '';
    // Advanta services endpoint: https://quicksms.advantasms.com/api/services
    const rawUrl =
      this.configService.get<string>('ADVANTA_BASE_URL') ||
      'https://quicksms.advantasms.com';
    this.baseUrl = rawUrl.replace(/\/$/, '');
  }

  /**
   * Send OTP via Advanta SMS API
   */
  async sendOtp(
    phone: string,
    otp: string,
    isFlash = false,
    config: ChurchSmsConfig = {},
  ): Promise<boolean> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const cleanPhone = this.formatPhone(phone);
    // Official OTP endpoint for transactional/OTP messages
    const url = `${resolved.baseUrl}/api/services/sendotp`;
    const message = this.sanitizeGsm7(
      `Your PulseLynk code is: ${otp}. Valid for 5 minutes.`,
    );

    const data: any = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      mobile: cleanPhone,
      message: message,
      shortcode: resolved.shortCode,
    };

    if (isFlash) {
      data.isFlash = 1; // Support Flash delivery if account is enabled
    }

    try {
      this.logger.log(
        `[SMS] Sending OTP to ${this.maskPhone(cleanPhone)}${isFlash ? ' (FLASH)' : ''} | ${this.formatDiagnostics(diagnostics)}`,
      );
      const response = await axios.post(url, data, { timeout: 10000 });

      // Official Advanta OTP response is wrapped in 'responses' array
      const success =
        response.data?.responses?.[0]?.['response-code'] == 200 ||
        response.data?.['response-code'] == 200;

      if (success) {
        this.logger.log(
          `[SMS] OTP sent successfully to ${this.maskPhone(cleanPhone)} | ${this.formatDiagnostics(diagnostics)}`,
        );
        return true;
      }

      this.logger.error(
        `[SMS] Advanta OTP error | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return false;
    } catch (e) {
      this.logger.error(
        `[SMS] Failed to send OTP | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return false;
    }
  }

  /**
   * Send Notification SMS
   */
  async sendSms(
    phone: string,
    message: string,
    config: ChurchSmsConfig = {},
  ): Promise<boolean> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const cleanPhone = this.formatPhone(phone);
    const url = `${resolved.baseUrl}/api/services/sendsms`;
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      mobile: cleanPhone,
      message: this.sanitizeGsm7(message),
      shortcode: resolved.shortCode,
    };

    try {
      this.logger.log(
        `[SMS] Sending notification to ${this.maskPhone(cleanPhone)} | ${this.formatDiagnostics(diagnostics)}`,
      );
      const response = await axios.post(url, data, { timeout: 10000 });

      const success =
        response.data?.['response-code'] == 200 ||
        response.data?.responses?.[0]?.['response-code'] == 200;
      if (success) {
        this.logger.log(
          `[SMS] Notification sent successfully to ${this.maskPhone(cleanPhone)} | ${this.formatDiagnostics(diagnostics)}`,
        );
        return true;
      }

      this.logger.error(
        `[SMS] Advanta notification error | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return false;
    } catch (e) {
      this.logger.error(
        `[SMS] Failed to send SMS | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return false;
    }
  }

  /**
   * Send transactional SMS to Safaricom hashed MSISDN values.
   */
  async sendSmsToHashedSafaricomNumber(
    hashedMobile: string,
    message: string,
    config: ChurchSmsConfig = {},
  ): Promise<boolean> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const url = `${resolved.baseUrl}/api/services/sendotp`;
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      mobile: hashedMobile,
      message: this.sanitizeGsm7(message),
      shortcode: resolved.shortCode,
      hashed: true,
    };

    try {
      this.logger.log(
        `[SMS] Sending hashed Safaricom notification to ${this.maskHashedMobile(hashedMobile)} | ${this.formatDiagnostics(diagnostics)}`,
      );
      const response = await axios.post(url, data, { timeout: 10000 });

      const success =
        response.data?.['response-code'] == 200 ||
        response.data?.responses?.[0]?.['response-code'] == 200;
      if (success) {
        this.logger.log(
          `[SMS] Hashed Safaricom notification sent successfully to ${this.maskHashedMobile(hashedMobile)} | ${this.formatDiagnostics(diagnostics)}`,
        );
        return true;
      }

      this.logger.error(
        `[SMS] Advanta hashed error | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return false;
    } catch (e) {
      this.logger.error(
        `[SMS] Failed to send hashed SMS | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return false;
    }
  }

  /**
   * Check SMS Balance
   */
  async getBalance(config: ChurchSmsConfig = {}): Promise<number> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const url = `${resolved.baseUrl}/api/services/getbalance`;
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
    };

    try {
      const response = await axios.post(url, data, { timeout: 10000 });
      if (response.data?.['response-code'] == 200) {
        // Success response uses "credit" field
        return parseFloat(response.data?.credit || '0');
      }
      this.logger.error(
        `[SMS] Balance failed | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return 0;
    } catch (e) {
      this.logger.error(
        `[SMS] Balance check failed | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return 0;
    }
  }

  public formatPhone(phone: string): string {
    if (!phone) return '';
    // Advanta requires 254... format for Kenya
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '254' + clean.substring(1);
    } else if (clean.startsWith('+')) {
      clean = clean.substring(1);
    }
    return clean;
  }

  /**
   * Ensure the message only contains GSM-7 compatible characters
   * to avoid Advanta delivery failures.
   */
  private sanitizeGsm7(text: string): string {
    const gsm7Chars =
      '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
    return text
      .split('')
      .map((char) => {
        if (gsm7Chars.indexOf(char) !== -1) return char;
        // Replace common non-GSM characters with safe alternatives
        if (char === '⚡') return 'FLASH';
        if (char === '🚀') return 'READY';
        if (char === '🔐') return 'CODE';
        // Fallback for others (strip them)
        return '';
      })
      .join('');
  }

  private resolveConfig(config: ChurchSmsConfig): ResolvedSmsConfig {
    return {
      partnerId: config.smsPartnerId || this.partnerId,
      apiKey: config.smsApiKey || this.apiKey,
      shortCode: config.smsShortcode || this.shortCode,
      baseUrl: (config.smsBaseUrl || this.baseUrl).replace(/\/$/, ''),
    };
  }

  private buildDiagnostics(
    config: ChurchSmsConfig,
    resolved: ResolvedSmsConfig,
  ) {
    return {
      partnerIdSource: this.resolveFieldSource(config.smsPartnerId, this.partnerId),
      apiKeySource: this.resolveFieldSource(config.smsApiKey, this.apiKey),
      shortCodeSource: this.resolveFieldSource(config.smsShortcode, this.shortCode),
      baseUrlSource: this.resolveFieldSource(config.smsBaseUrl, this.baseUrl),
      partnerIdHint: this.maskSecret(resolved.partnerId),
      shortCodeHint: this.maskSecret(resolved.shortCode),
      apiKeyPresent: Boolean(resolved.apiKey),
      baseUrl: resolved.baseUrl,
    };
  }

  private resolveFieldSource(
    churchValue: string | null | undefined,
    envValue: string | null | undefined,
  ) {
    if (churchValue) {
      return 'church';
    }

    if (envValue) {
      return 'env';
    }

    return 'missing';
  }

  private formatDiagnostics(diagnostics: ReturnType<typeof this.buildDiagnostics>) {
    return [
      `partnerIdSource=${diagnostics.partnerIdSource}`,
      `apiKeySource=${diagnostics.apiKeySource}`,
      `shortCodeSource=${diagnostics.shortCodeSource}`,
      `baseUrlSource=${diagnostics.baseUrlSource}`,
      `partnerId=${diagnostics.partnerIdHint}`,
      `shortcode=${diagnostics.shortCodeHint}`,
      `apiKeyPresent=${diagnostics.apiKeyPresent}`,
      `baseUrl=${diagnostics.baseUrl}`,
    ].join(' | ');
  }

  private describeProviderResponse(data: any) {
    if (!data) {
      return 'providerResponse=empty';
    }

    const nested = data?.responses?.[0];
    const responseCode = nested?.['response-code'] ?? data?.['response-code'];
    const responseDescription =
      nested?.['response-description'] ?? data?.['response-description'];
    const messageId = nested?.messageid ?? data?.messageid;

    return [
      `providerCode=${responseCode ?? 'unknown'}`,
      `providerDescription=${responseDescription ?? 'n/a'}`,
      `messageId=${messageId ? this.maskSecret(String(messageId)) : 'n/a'}`,
    ].join(' | ');
  }

  private describeAxiosError(error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 'no-status';
      const providerResponse = this.describeProviderResponse(error.response?.data);
      return `status=${status} | message=${error.message} | ${providerResponse}`;
    }

    return `message=${error?.message || 'Unknown error'}`;
  }

  private maskSecret(value: string | null | undefined) {
    if (!value) {
      return 'missing';
    }

    if (value.length <= 4) {
      return `***${value.slice(-1)}`;
    }

    return `${'*'.repeat(Math.max(3, value.length - 4))}${value.slice(-4)}`;
  }

  private maskPhone(phone: string) {
    if (!phone) {
      return 'missing';
    }

    if (phone.length <= 6) {
      return `***${phone.slice(-2)}`;
    }

    return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
  }

  private maskHashedMobile(hashedMobile: string) {
    if (!hashedMobile) {
      return 'missing';
    }

    if (hashedMobile.length <= 12) {
      return this.maskSecret(hashedMobile);
    }

    return `${hashedMobile.slice(0, 6)}...${hashedMobile.slice(-6)}`;
  }
}
