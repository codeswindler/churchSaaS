import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'church-system-secret-change-in-production',
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      role: payload.role,
      userType: payload.userType,
      churchId: payload.churchId,
    };
  }
}
