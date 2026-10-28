import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const UPLOADER_ID = 'uploader@bakatrouble.me';
export const LIGHTBOX_ID = 'booru@bakatrouble.me';

const repoRoot = new URL('../..', import.meta.url).pathname;

const distDir = (dir: string): string => {
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
        throw new Error(
            `no built extension in ${dir} (run the firefox build first)`,
        );
    }
    return dir;
};

export const UPLOADER_DIST =
    process.env.BOORU_UPLOADER_DIST ??
    distDir(path.join(repoRoot, '.output', 'firefox-mv2'));

export const LIGHTBOX_DIST =
    process.env.BOORU_LIGHTBOX_DIST ??
    distDir(
        path.join(
            process.env.BOORU_LIGHTBOX_REPO ??
                path.join(path.dirname(repoRoot), 'booru-lightbox-extension'),
            '.output',
            'firefox-mv2',
        ),
    );

export const makeProfileDir = () =>
    fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-firefox-profile-'));
