import { isDuplicateKeyError } from './mongo-error';

describe('isDuplicateKeyError', () => {
  it('detects Mongo duplicate key code 11000', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ message: 'E11000 duplicate key error collection' })).toBe(true);
    expect(isDuplicateKeyError({ code: 11001 })).toBe(false);
    expect(isDuplicateKeyError(new Error('Account not found'))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});
