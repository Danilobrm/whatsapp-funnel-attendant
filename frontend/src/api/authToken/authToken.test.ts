import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  clearAuthStorage,
  getAuthToken,
  getStoredUserJson,
  setAuthToken,
  setStoredUserJson,
} from './authToken.ts';

beforeEach(() => {
  window.localStorage.clear();
});

describe('authToken', () => {
  it('round-trips the token through localStorage', () => {
    expect(getAuthToken()).toBeNull();

    setAuthToken('jwt-123');

    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('jwt-123');
    expect(getAuthToken()).toBe('jwt-123');
  });

  it('round-trips the user snapshot', () => {
    setStoredUserJson('{"id":1}');

    expect(window.localStorage.getItem(AUTH_USER_STORAGE_KEY)).toBe('{"id":1}');
    expect(getStoredUserJson()).toBe('{"id":1}');
  });

  it('clears BOTH keys — half a session is not a session', () => {
    setAuthToken('jwt-123');
    setStoredUserJson('{"id":1}');

    clearAuthStorage();

    expect(getAuthToken()).toBeNull();
    expect(getStoredUserJson()).toBeNull();
  });
});
