import { normalizeVietnamPhoneNumber } from './phone-number.js';

describe('normalizeVietnamPhoneNumber', () => {
  it.each([
    ['0901234567', '+84901234567'],
    ['84901234567', '+84901234567'],
    ['+84901234567', '+84901234567'],
    ['090 123 4567', '+84901234567'],
    ['090-123-4567', '+84901234567'],
    ['(090) 123.4567', '+84901234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeVietnamPhoneNumber(input)).toBe(expected);
  });

  it.each(['', '123', '+841234', '09012345678', '+8490123456a'])(
    'rejects %s',
    (input) => expect(normalizeVietnamPhoneNumber(input)).toBeNull(),
  );
});
