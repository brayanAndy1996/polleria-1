import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME, readSessionCookie } from './session-cookie.ts';

describe('003: lectura de la cookie', () => {
  it('AC-11: el nombre de la cookie es polleria_session', () => {
    expect(SESSION_COOKIE_NAME).toBe('polleria_session');
  });
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['polleria_session=abc', 'abc'],
    ['a=1; polleria_session=abc; b=2', 'abc'],
    ['a=1;polleria_session=abc', 'abc'],
    ['  polleria_session=abc  ', 'abc'],
    ['polleria_session=', undefined],
    ['xpolleria_session=abc', undefined],
    ['polleria_session_old=abc', undefined],
    ['POLLERIA_SESSION=abc', undefined],
    ['polleria_session=abc; polleria_session=def', 'abc'],
    ['polleria_session=a=b', 'a=b'],
    ['polleria_session="abc"', '"abc"'],
  ])('AC-11: interpreta la cabecera %s sin lanzar', (header, expected) => {
    expect(readSessionCookie(header)).toBe(expected);
  });
});
