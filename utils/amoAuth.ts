import jwt from 'jwt-simple';

export const getAuth = (key: string, secret: string) => {
    const issueTime = Math.floor(Date.now() / 1000);
    return jwt.encode(
        {
            iss: key,
            jti: Math.random().toString(),
            iat: issueTime,
            exp: issueTime + 300,
        },
        secret,
    );
};
