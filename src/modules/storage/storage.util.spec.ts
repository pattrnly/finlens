import { isLocalStoredPath, s3KeyFromLocalPath, statementObjectKey } from './storage.util';

describe('storage.util', () => {
  it('treats disk paths as local and S3 keys as remote', () => {
    expect(isLocalStoredPath('uploads/abc/file.pdf')).toBe(true);
    expect(isLocalStoredPath('./uploads/abc/file.pdf')).toBe(true);
    expect(isLocalStoredPath('C:\\data\\file.pdf')).toBe(true);
    expect(isLocalStoredPath('/var/uploads/file.pdf')).toBe(true);
    expect(isLocalStoredPath('statements/abc/123-file.pdf')).toBe(false);
  });

  it('builds a namespaced S3 object key', () => {
    expect(statementObjectKey('user1', 'Acct Statement.pdf', 99, 'statements')).toBe(
      'statements/user1/99-Acct_Statement.pdf',
    );
  });

  it('maps a local upload path to an S3 key', () => {
    expect(
      s3KeyFromLocalPath(
        'user1',
        'uploads\\user1\\179-Acct_Statement.pdf',
        'statements',
      ),
    ).toBe('statements/user1/179-Acct_Statement.pdf');
  });
});
