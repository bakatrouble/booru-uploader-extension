// Fake gallery (for the lightbox `local` adapter, which matches
// 127.0.0.1:18474) and fake channel-helper API (so the uploader can run
// its full HTTP flow without a real instance key). Pure node:http.
import http from 'node:http';

// 1x1 transparent PNG — decodable, so SlideContent fires `load`.
const PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

const SLOW_DELAY_MS = Number(process.env.E2E_SLOW_IMAGE_MS ?? 5000);

interface ApiRequestLog {
    at: number;
    method: string;
    path: string;
    xKey?: string | null;
    contentType?: string | null;
    bytes?: number;
    json?: unknown;
}

const requests: ApiRequestLog[] = [];

const singleHeader = (value: string | string[] | undefined): string | null =>
    Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const log = (entry: Omit<ApiRequestLog, 'at'>) => {
    requests.push({ at: Date.now(), ...entry });
    console.log(`[fake-api] ${entry.method} ${entry.path}`);
};

const GALLERY_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>e2e gallery</title></head>
<body>
<a href="/full-fast.jpg" data-mime="image/jpeg" data-filename="fast.jpg"><img class="thumb" src="/thumb.jpg"></a>
<a href="/full-slow.jpg" data-mime="image/jpeg" data-filename="slow.jpg"><img class="thumb" src="/thumb.jpg"></a>
<a href="/anim.gif" data-mime="image/gif" data-filename="anim.gif"><img class="thumb" src="/thumb.jpg"></a>
</body></html>`;

const readBody = (req: http.IncomingMessage): Promise<Buffer> =>
    new Promise((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
    });

export const startServer = (port = 18474) =>
    new Promise<http.Server>((resolve) => {
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const cors = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'x-key, content-type',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            };
            if (req.method === 'OPTIONS') {
                res.writeHead(204, cors).end();
                return;
            }
            if (url.pathname === '/') {
                res.writeHead(200, {
                    'Content-Type': 'text/html',
                    ...cors,
                }).end(GALLERY_HTML);
                return;
            }
            if (url.pathname === '/thumb.jpg') {
                res.writeHead(200, { 'Content-Type': 'image/png' }).end(
                    PIXEL_PNG,
                );
                return;
            }
            if (url.pathname === '/full-fast.jpg') {
                res.writeHead(200, { 'Content-Type': 'image/png' }).end(
                    PIXEL_PNG,
                );
                return;
            }
            if (url.pathname === '/full-slow.jpg') {
                await new Promise((r) => setTimeout(r, SLOW_DELAY_MS));
                res.writeHead(200, { 'Content-Type': 'image/png' }).end(
                    PIXEL_PNG,
                );
                return;
            }
            if (url.pathname === '/anim.gif') {
                res.writeHead(200, { 'Content-Type': 'image/png' }).end(
                    PIXEL_PNG,
                );
                return;
            }
            if (url.pathname === '/hashes' && req.method === 'GET') {
                log({
                    method: 'GET',
                    path: '/hashes',
                    xKey: singleHeader(req.headers['x-key']),
                });
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    ...cors,
                }).end(JSON.stringify({ status: 'success', hashes: [] }));
                return;
            }
            if (url.pathname.startsWith('/hashes/') && req.method === 'GET') {
                log({
                    method: 'GET',
                    path: url.pathname,
                    xKey: singleHeader(req.headers['x-key']),
                });
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    ...cors,
                }).end(JSON.stringify({ status: 'success', exists: false }));
                return;
            }
            if (url.pathname === '/upload' && req.method === 'POST') {
                const body = await readBody(req);
                log({
                    method: 'POST',
                    path: '/upload',
                    xKey: singleHeader(req.headers['x-key']),
                    contentType: singleHeader(req.headers['content-type']),
                    bytes: body.length,
                });
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    ...cors,
                }).end(
                    JSON.stringify({
                        status: 'ok',
                        hash: 'h1',
                        upload_id: 'u1',
                    }),
                );
                return;
            }
            if (url.pathname === '/upload-url' && req.method === 'POST') {
                const body = await readBody(req);
                let json = null;
                try {
                    json = JSON.parse(body.toString('utf8'));
                } catch {}
                log({
                    method: 'POST',
                    path: '/upload-url',
                    xKey: singleHeader(req.headers['x-key']),
                    json,
                });
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    ...cors,
                }).end(
                    JSON.stringify({
                        status: 'ok',
                        hash: 'h1',
                        upload_id: 'u1',
                    }),
                );
                return;
            }
            if (url.pathname === '/__log' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(
                    JSON.stringify(requests),
                );
                return;
            }
            if (url.pathname === '/__reset' && req.method === 'POST') {
                requests.length = 0;
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(
                    JSON.stringify({ status: 'ok' }),
                );
                return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end(
                'not found',
            );
        });
        server.listen(port, '127.0.0.1', () => resolve(server));
    });

// Self-run for Playwright's webServer (`node tests/e2e-firefox/server.ts`;
// Node 22.6+ strips types natively, no build step needed).
if (process.argv[1] && /server\.[cm]?[jt]s$/.test(process.argv[1])) {
    const port = Number(process.env.E2E_PORT ?? 18474);
    startServer(port).then(() =>
        console.log(`fake gallery+api listening on 127.0.0.1:${port}`),
    );
}
