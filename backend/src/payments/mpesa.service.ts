import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ChurchMpesaConfig } from '../common/church.utils';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  private getBaseUrl(environment: string | null | undefined) {
    return (environment || process.env.MPESA_ENV) === 'sandbox'
      ? 'https://sandbox.safaricom.co.ke'
      : 'https://api.safaricom.co.ke';
  }

  async getAccessToken(config: ChurchMpesaConfig = {}): Promise<string> {
    const resolved = this.resolveConfig(config);
    const credentials = Buffer.from(
      `${resolved.consumerKey}:${resolved.consumerSecret}`,
    ).toString('base64');
    const response = await axios.get(
      `${this.getBaseUrl(resolved.environment)}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      },
    );

    return response.data.access_token;
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
        config.mpesaEnvironment || process.env.MPESA_ENV || 'sandbox',
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
}
