import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: process.env.APP_NAME || 'choice-networks-church-saas',
      timestamp: new Date().toISOString(),
    };
  }
}
