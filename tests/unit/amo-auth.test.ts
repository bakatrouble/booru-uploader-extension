import jwt from 'jwt-simple';
import { describe, expect, it } from 'vitest';
import { getAuth } from '@/utils/amoAuth';

describe('getAuth', () => {
    it('encodes iss with a 300s expiry', () => {
        const token = getAuth('key123', 'secret');
        const payload = jwt.decode(token, 'secret') as {
            iss: string;
            jti: string;
            iat: number;
            exp: number;
        };
        expect(payload.iss).toBe('key123');
        expect(payload.exp - payload.iat).toBe(300);
        expect(typeof payload.jti).toBe('string');
    });
});
