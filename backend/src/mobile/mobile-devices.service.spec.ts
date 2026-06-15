import { BadRequestException } from '@nestjs/common';
import { MobileDevicePlatform } from '../entities/mobile-device.entity';
import { MobileDevicesService } from './mobile-devices.service';

describe('MobileDevicesService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((payload) => payload),
    save: jest.fn(),
  };
  let service: MobileDevicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MobileDevicesService(repo as any);
  });

  it('requires an FCM token', async () => {
    await expect(
      service.registerDevice('church-1', 'user-1', {
        platform: MobileDevicePlatform.ANDROID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registers an android token for the church user', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockImplementation(async (device) => ({
      id: 'device-1',
      createdAt: new Date('2026-06-14T09:00:00Z'),
      ...device,
    }));

    const result = await service.registerDevice('church-1', 'user-1', {
      fcmToken: 'token-123',
      platform: 'android',
      appVersion: '1.0.0',
      deviceName: 'Pixel',
    });

    expect(repo.create).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: 'church-1',
        churchUserId: 'user-1',
        fcmToken: 'token-123',
        isActive: true,
      }),
    );
    expect(result).toMatchObject({
      id: 'device-1',
      platform: MobileDevicePlatform.ANDROID,
      appVersion: '1.0.0',
      deviceName: 'Pixel',
      isActive: true,
    });
  });
});
