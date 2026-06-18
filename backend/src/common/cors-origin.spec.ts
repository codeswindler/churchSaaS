import { createCorsOriginHandler } from './cors-origin';

describe('createCorsOriginHandler', () => {
  const handler = createCorsOriginHandler([
    'https://church.choicenetworks.co.ke',
    'https://localhost',
  ]);

  it('allows configured origins and requests without an Origin header', () => {
    const configuredCallback = jest.fn();
    const nativeCallback = jest.fn();

    handler('https://localhost', configuredCallback);
    handler(undefined, nativeCallback);

    expect(configuredCallback).toHaveBeenCalledWith(null, true);
    expect(nativeCallback).toHaveBeenCalledWith(null, true);
  });

  it('rejects unconfigured origins without raising an internal error', () => {
    const callback = jest.fn();

    handler('https://untrusted.example', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });
});
