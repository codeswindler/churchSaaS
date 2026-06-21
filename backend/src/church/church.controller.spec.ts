import { ROLES_KEY } from '../auth/roles.decorator';
import { ChurchUserRole } from '../entities/church-user.entity';
import { ChurchController } from './church.controller';

describe('ChurchController staff authorization', () => {
  it.each(['createUser', 'updateUser', 'resendUserCredentials'])(
    'restricts %s to Priest',
    (methodName) => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ChurchController.prototype[methodName as keyof ChurchController],
      );
      expect(roles).toEqual([ChurchUserRole.PRIEST]);
    },
  );

  it('allows User accounts to view staff when they retain users.view', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      ChurchController.prototype.listUsers,
    );
    expect(roles).toEqual([ChurchUserRole.PRIEST, ChurchUserRole.USER]);
  });
});
