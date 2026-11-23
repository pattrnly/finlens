import { clientOrigins, isAllowedCorsOrigin } from './cors-origin';

describe('CORS origins', () => {
  it('always allows local Vite and preview', () => {
    expect(clientOrigins('http://example.com')).toEqual(
      expect.arrayContaining([
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://example.com',
      ]),
    );
    expect(isAllowedCorsOrigin('http://localhost:5173', 'https://app.example.com')).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5173', 'https://app.example.com')).toBe(true);
  });

  it('allows the configured client and the same hostname on another port', () => {
    const env = 'http://43.205.223.172:5173';
    expect(isAllowedCorsOrigin('http://43.205.223.172:5173', env)).toBe(true);
    expect(isAllowedCorsOrigin('http://43.205.223.172', env)).toBe(true);
    expect(isAllowedCorsOrigin('http://evil.example', env)).toBe(false);
  });

  it('accepts comma-separated CLIENT_URL values', () => {
    const env = 'http://localhost:5173, http://43.205.223.172';
    expect(isAllowedCorsOrigin('http://43.205.223.172', env)).toBe(true);
  });
});
