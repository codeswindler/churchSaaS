import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ChurchMpesaB2cConfig,
  ChurchMpesaConfig,
} from '../common/church.utils';

export interface MpesaB2cRequest {
  phoneNumber: string;
  amount: number;
  remarks: string;
  occasion?: string | null;
}

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  private getBaseUrl(environment: string | null | undefined) {
    return this.normalizeEnvironment(environment) === 'sandbox'
      ? 'https://sandbox.safaricom.co.ke'
      : 'https://api.safaricom.co.ke';
  }

  async getAccessToken(config: ChurchMpesaConfig = {}): Promise<string> {
    const resolved = this.resolveConfig(config);
    return this.getAccessTokenForCredentials({
      environment: resolved.environment,
      consumerKey: resolved.consumerKey as string,
      consumerSecret: resolved.consumerSecret as string,
    });
  }

  private async getAccessTokenForCredentials(config: {
    environment: string;
    consumerKey: string;
    consumerSecret: string;
  }): Promise<string> {
    const credentials = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`,
    ).toString('base64');
    try {
      const response = await axios.get(
        `${this.getBaseUrl(config.environment)}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${credentials}`,
          },
        },
      );

      return response.data.access_token;
    } catch (error) {
      this.logger.error(
        `M-Pesa access token failed | environment=${config.environment} | consumerKeyPresent=${Boolean(config.consumerKey)} | consumerSecretPresent=${Boolean(config.consumerSecret)} | ${this.describeAxiosError(error)}`,
      );
      throw new BadRequestException(
        'Unable to generate M-Pesa access token. Check that the selected Daraja environment matches the consumer key and consumer secret.',
      );
    }
  }

  assertConfigured(config: ChurchMpesaConfig = {}) {
    this.resolveConfig(config);
  }

  async stkPush(
    phone: string,
    amount: number,
    accountReference: string,
    transactionDesc: string,
    config: ChurchMpesaConfig = {},
  ) {
    const resolved = this.resolveConfig(config);
    const accessToken = await this.getAccessToken(config);
    const timestamp = this.getTimestamp();
    const password = Buffer.from(
      `${resolved.shortcode}${resolved.passkey}${timestamp}`,
    ).toString('base64');

    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = `254${formattedPhone.substring(1)}`;
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }

    const payload = {
      BusinessShortCode: resolved.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: formattedPhone,
      PartyB: resolved.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: resolved.callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    };

    this.logger.log(
      `Initiating STK Push for ${formattedPhone} amount KES ${amount}`,
    );

    try {
      const response = await axios.post(
        `${this.getBaseUrl(resolved.environment)}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `M-Pesa STK push failed | ${this.formatDiagnostics(resolved)} | ${this.describeAxiosError(error)}`,
      );
      const providerMessage = this.getProviderMessage(error);
      if (/invalid access token/i.test(providerMessage)) {
        throw new BadRequestException(
          'Daraja rejected the STK push with Invalid Access Token. Check that the M-Pesa environment matches the saved credentials, shortcode, and passkey.',
        );
      }
      throw new BadRequestException(
        providerMessage ||
          'Unable to initiate M-Pesa STK push. Check the M-Pesa configuration.',
      );
    }
  }

  async b2cPayment(
    input: MpesaB2cRequest,
    config: ChurchMpesaB2cConfig = {},
  ) {
    const resolved = this.resolveB2cConfig(config);
    const accessToken = await this.getAccessTokenForCredentials({
      environment: resolved.environment,
      consumerKey: resolved.consumerKey,
      consumerSecret: resolved.consumerSecret,
    });

    const payload = {
      InitiatorName: resolved.initiatorName,
      SecurityCredential: resolved.securityCredential,
      CommandID: resolved.commandId,
      Amount: Math.ceil(Number(input.amount || 0)),
      PartyA: resolved.shortcode,
      PartyB: input.phoneNumber,
      Remarks: input.remarks,
      QueueTimeOutURL: resolved.timeoutUrl,
      ResultURL: resolved.resultUrl,
      Occasion: input.occasion || '',
    };

    this.logger.log(
      `Initiating M-Pesa B2C payment | environment=${resolved.environment} | shortcode=${this.maskSecret(resolved.shortcode)} | partyB=${this.maskPhone(input.phoneNumber)} | amount=${payload.Amount}`,
    );

    try {
      const response = await axios.post(
        `${this.getBaseUrl(resolved.environment)}/mpesa/b2c/v1/paymentrequest`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `M-Pesa B2C request failed | environment=${resolved.environment} | shortcode=${this.maskSecret(resolved.shortcode)} | partyB=${this.maskPhone(input.phoneNumber)} | ${this.describeAxiosError(error)}`,
      );
      throw new BadRequestException(
        this.getProviderMessage(error) ||
          'Unable to submit M-Pesa B2C payment request.',
      );
    }
  }

  private getTimestamp(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = `0${date.getMonth() + 1}`.slice(-2);
    const day = `0${date.getDate()}`.slice(-2);
    const hour = `0${date.getHours()}`.slice(-2);
    const minute = `0${date.getMinutes()}`.slice(-2);
    const second = `0${date.getSeconds()}`.slice(-2);
    return `${year}${month}${day}${hour}${minute}${second}`;
  }

  private resolveConfig(config: ChurchMpesaConfig) {
    const resolved = {
      environment:
        this.normalizeEnvironment(
          config.mpesaEnvironment || process.env.MPESA_ENV || 'sandbox',
        ),
      consumerKey: config.mpesaConsumerKey,
      consumerSecret: config.mpesaConsumerSecret,
      passkey: config.mpesaPasskey,
      shortcode: config.mpesaShortcode,
      callbackUrl: config.mpesaCallbackUrl || process.env.MPESA_CALLBACK_URL,
    };

    const missing = [
      ['church consumer key', resolved.consumerKey],
      ['church consumer secret', resolved.consumerSecret],
      ['church passkey', resolved.passkey],
      ['church shortcode', resolved.shortcode],
      ['callback URL', resolved.callbackUrl],
    ]
      .filter(([, value]) => !value)
      .map(([label]) => label);

    if (missing.length > 0) {
      throw new BadRequestException(
        `M-Pesa is not configured for this church. Missing ${missing.join(', ')}`,
      );
    }

    return resolved;
  }

  private resolveB2cConfig(config: ChurchMpesaB2cConfig) {
    const environment = this.normalizeEnvironment(
      config.mpesaEnvironment || process.env.MPESA_B2C_ENV || 'sandbox',
    );
    const resultUrl =
      process.env.MPESA_B2C_RESULT_URL ||
      this.buildB2cCallbackUrl('result');
    const timeoutUrl =
      process.env.MPESA_B2C_TIMEOUT_URL ||
      this.buildB2cCallbackUrl('timeout');
    const resolved = {
      environment,
      consumerKey: config.mpesaB2cConsumerKey || '',
      consumerSecret: config.mpesaB2cConsumerSecret || '',
      shortcode: config.mpesaB2cShortcode || '',
      initiatorName: config.mpesaB2cInitiatorName || '',
      securityCredential: config.mpesaB2cSecurityCredential || '',
      commandId:
        config.mpesaB2cCommandId ||
        process.env.MPESA_B2C_COMMAND_ID ||
        'BusinessPayment',
      resultUrl,
      timeoutUrl,
    };

    const missing = [
      ['B2C consumer key', resolved.consumerKey],
      ['B2C consumer secret', resolved.consumerSecret],
      ['B2C shortcode', resolved.shortcode],
      ['B2C initiator name', resolved.initiatorName],
      ['B2C security credential', resolved.securityCredential],
      ['B2C result URL', resolved.resultUrl],
      ['B2C timeout URL', resolved.timeoutUrl],
    ]
      .filter(([, value]) => !value)
      .map(([label]) => label);

    if (missing.length > 0) {
      throw new BadRequestException(
        `M-Pesa B2C is not configured. Missing ${missing.join(', ')}`,
      );
    }

    return resolved;
  }

  private buildB2cCallbackUrl(type: 'result' | 'timeout') {
    const base =
      process.env.MPESA_B2C_CALLBACK_BASE_URL ||
      process.env.APP_PUBLIC_URL ||
      (process.env.FRONTEND_URLS || '')
        .split(',')
        .map((value) => value.trim())
        .find(Boolean) ||
      '';
    if (!base) {
      return '';
    }

    return `${base.replace(/\/+$/, '')}/api/mobile/b2c/withdrawals/callback/${type}`;
  }

  private normalizeEnvironment(value: string | null | undefined) {
    return `${value || 'sandbox'}`.toLowerCase() === 'production'
      ? 'production'
      : 'sandbox';
  }

  private formatDiagnostics(resolved: ReturnType<typeof this.resolveConfig>) {
    return [
      `environment=${resolved.environment}`,
      `shortcode=${this.maskSecret(resolved.shortcode)}`,
      `consumerKeyPresent=${Boolean(resolved.consumerKey)}`,
      `consumerSecretPresent=${Boolean(resolved.consumerSecret)}`,
      `passkeyPresent=${Boolean(resolved.passkey)}`,
      `callbackUrlPresent=${Boolean(resolved.callbackUrl)}`,
    ].join(' | ');
  }

  private getProviderMessage(error: any) {
    const data = axios.isAxiosError(error) ? error.response?.data : null;
    return (
      data?.errorMessage ||
      data?.errorMessageEn ||
      data?.ResponseDescription ||
      data?.responseDescription ||
      data?.error ||
      error?.message ||
      ''
    );
  }

  private describeAxiosError(error: any) {
    if (!axios.isAxiosError(error)) {
      return `message=${error?.message || 'Unknown error'}`;
    }

    const data = error.response?.data;
    return [
      `status=${error.response?.status || 'no-status'}`,
      `message=${error.message}`,
      `providerMessage=${this.getProviderMessage(error) || 'n/a'}`,
      `providerCode=${data?.errorCode || data?.ResponseCode || 'n/a'}`,
    ].join(' | ');
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

  private maskPhone(value: string | null | undefined) {
    const digits = `${value || ''}`.replace(/\D/g, '');
    if (digits.length <= 6) {
      return '***';
    }
    return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
  }
}
