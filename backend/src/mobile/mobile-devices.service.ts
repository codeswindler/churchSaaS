import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MobileDevice,
  MobileDevicePlatform,
} from '../entities/mobile-device.entity';

@Injectable()
export class MobileDevicesService {
  constructor(
    @InjectRepository(MobileDevice)
    private readonly mobileDeviceRepo: Repository<MobileDevice>,
  ) {}

  async registerDevice(churchId: string, churchUserId: string, body: any) {
    const fcmToken = `${body.fcmToken || ''}`.trim();
    if (!fcmToken) {
      throw new BadRequestException('FCM token is required');
    }

    const platform = `${body.platform || MobileDevicePlatform.ANDROID}`.trim();
    if (platform !== MobileDevicePlatform.ANDROID) {
      throw new BadRequestException('Only android devices are supported');
    }

    let device = await this.mobileDeviceRepo.findOne({ where: { fcmToken } });
    if (!device) {
      device = this.mobileDeviceRepo.create({ fcmToken });
    }

    device.churchId = churchId;
    device.churchUserId = churchUserId;
    device.platform = MobileDevicePlatform.ANDROID;
    device.appVersion = this.normalizeOptional(body.appVersion, 80);
    device.deviceName = this.normalizeOptional(body.deviceName, 160);
    device.isActive = true;
    device.lastSeenAt = new Date();
    device.deactivatedAt = null;

    const saved = await this.mobileDeviceRepo.save(device);
    return this.mapDevice(saved);
  }

  async deactivateDevice(
    churchId: string,
    churchUserId: string,
    deviceId: string,
  ) {
    const device = await this.mobileDeviceRepo.findOne({
      where: { id: deviceId, churchId, churchUserId },
    });
    if (!device) {
      throw new NotFoundException('Mobile device not found');
    }

    device.isActive = false;
    device.deactivatedAt = new Date();
    await this.mobileDeviceRepo.save(device);
    return this.mapDevice(device);
  }

  private normalizeOptional(value: unknown, maxLength: number) {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }
    const normalized = `${value}`.trim();
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private mapDevice(device: MobileDevice) {
    return {
      id: device.id,
      platform: device.platform,
      appVersion: device.appVersion,
      deviceName: device.deviceName,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    };
  }
}
