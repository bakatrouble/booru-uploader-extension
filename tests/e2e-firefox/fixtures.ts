import { createRequire } from 'node:module';
import {
    type BrowserContext,
    test as base,
    firefox,
    type Page,
} from '@playwright/test';
import {
    LIGHTBOX_DIST,
    LIGHTBOX_ID,
    makeProfileDir,
    UPLOADER_DIST,
    UPLOADER_ID,
} from './profile';

const require = createRequire(import.meta.url);
const webextRoot = require.resolve('web-ext').replace(/index\.js$/, '');

interface RdpClient {
    request: (req: string | Record<string, unknown>) => Promise<any>;
    on: (event: string, listener: (msg: unknown) => void) => void;
}

export interface RemoteFirefox {
    client: RdpClient;
    installTemporaryAddon: (sourceDir: string) => Promise<{
        addon: { id: string };
    }>;
    getInstalledAddon: (addonId: string) => Promise<{
        id: string;
        actor: string;
        manifestURL: string;
    }>;
}

const { connectWithMaxRetries } = (await import(
    `file://${webextRoot}lib/firefox/remote.js`
)) as {
    connectWithMaxRetries: (opts: {
        port: number;
        maxRetries?: number;
        retryInterval?: number;
    }) => Promise<RemoteFirefox>;
};

const DEBUGGER_PORT = Number(process.env.E2E_DEBUGGER_PORT ?? 48911);
const E2E_PORT = Number(process.env.E2E_PORT ?? 18474);

// One persistent context per worker, shared serially by the spec file:
// both extensions installed once as temporary add-ons via web-ext's own
// remote client (no signing, prefs, or profile surgery — bypassing
// web-ext run's single --source-dir limit, mozilla/web-ext#1107).
// (Playwright's built-in `context`/`page` fixtures can't be re-scoped,
// hence the `p`-prefixed names.)
interface CouplingWorkerFixtures {
    pcontext: BrowserContext;
    installed: null;
}

interface CouplingTestFixtures {
    wpage: Page;
}

// biome-ignore lint/complexity/noBannedTypes: Playwright's documented worker-fixture pattern.
const workerTest = base.extend<{}, CouplingWorkerFixtures>({
    pcontext: [
        // biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object pattern here.
        async ({}, use) => {
            const profileDir = makeProfileDir();
            const context = await firefox.launchPersistentContext(profileDir, {
                headless: true,
                baseURL: `http://127.0.0.1:${E2E_PORT}`,
                args: ['-start-debugger-server', String(DEBUGGER_PORT)],
                // Test mode: allow the DevTools RDP server. Firefox
                // ignores -start-debugger-server unless BOTH prefs are
                // true (see DevToolsStartup._isRemoteDebuggingEnabled).
                // web-ext's remote client then installs both extensions
                // as temporary add-ons on this port.
                firefoxUserPrefs: {
                    'devtools.debugger.remote-enabled': true,
                    'devtools.chrome.enabled': true,
                    'devtools.debugger.prompt-connection': false,
                },
            });
            await use(context);
            await context.close();
        },
        { scope: 'worker' },
    ],
    installed: [
        async ({ pcontext }, use) => {
            // Declared dependency: the browser must be up (and its
            // devtools server listening) before connecting.
            void pcontext;
            const remote = await connectWithMaxRetries({
                port: DEBUGGER_PORT,
            });
            remoteClient = remote;
            const pairs: Array<[string, string]> = [
                [UPLOADER_DIST, UPLOADER_ID],
                [LIGHTBOX_DIST, LIGHTBOX_ID],
            ];
            for (const [sourceDir, addonId] of pairs) {
                const started = Date.now();
                await remote.installTemporaryAddon(sourceDir);
                // The install response only carries the id; the full
                // record (with manifestURL) comes from listAddons.
                const addon = await remote.getInstalledAddon(addonId);
                // manifestURL looks like moz-extension://<uuid>/manifest.json;
                // note `new URL(...).origin` is the string "null" here
                // (moz-extension is not a special scheme), so strip the
                // path instead.
                const origin = addon.manifestURL.replace(
                    /\/manifest\.json$/,
                    '',
                );
                origins.set(addon.id, origin);
                console.log(
                    `installed temporary add-on ${addon.id} ` +
                        `at ${origin} in ${Date.now() - started}ms`,
                );
            }
            await use(null);
        },
        { scope: 'worker', auto: true },
    ],
});

export const test = workerTest.extend<CouplingTestFixtures>({
    wpage: async ({ pcontext }, use) => {
        // Test-scoped on purpose: a page that went through an
        // out-of-band RDP navigation keeps confusing Playwright's
        // navigation tracking, so never reuse it across tests.
        const page = await pcontext.newPage();
        await use(page);
        await page.close();
    },
});

export { expect } from '@playwright/test';
export { LIGHTBOX_ID, UPLOADER_ID };

let remoteClient: RemoteFirefox | null = null;

interface RdpTab {
    actor: string;
    url?: string;
}

// Navigate ANY tab to a URL over RDP — including moz-extension:// pages,
// where Playwright's own goto hangs and RDP navigation kills Playwright's
// handle for the tab. Always operates on a throwaway page so the caller's
// pages stay usable.
export async function rdpNavigate(
    context: BrowserContext,
    url: string,
): Promise<void> {
    const marker = `rdp-${Math.random().toString(36).slice(2)}`;
    const markerPage = await context.newPage();
    try {
        await markerPage.evaluate((m: string) => {
            window.location.hash = m;
        }, marker);
    } catch {
        // Best effort: fall back to matching any blank tab below.
    }
    if (!remoteClient) {
        throw new Error('RDP client not connected (install fixture first)');
    }
    const tabs = (await remoteClient.client.request('listTabs')) as {
        tabs?: RdpTab[];
    };
    const tab = (tabs.tabs ?? []).find(
        (t) => typeof t.url === 'string' && t.url.endsWith(`#${marker}`),
    );
    if (!tab) {
        throw new Error(
            `RDP tab not found for marker ${marker} ` +
                `among [${(tabs.tabs ?? []).map((t) => t.url).join(', ')}]`,
        );
    }
    // RDP waits for load server-side (waitForLoad). DO NOT poll
    // page.url() here: Playwright never observes RDP-initiated
    // navigations, so it reports a stale URL forever. Callers assert on
    // live DOM (locators work fine — only navigation tracking is blind).
    await remoteClient.client.request({
        to: tab.actor,
        type: 'navigateTo',
        url,
        waitForLoad: true,
    });
}

// Evaluate `script` inside an extension document (options page,
// background page, …) matched by URL substring, through its
// WebExtensionInspectedWindow actor — the supported way to run code in an
// add-on context. Unlike tab-console evaluation, this answers synchronously
// with the completion value inline. The script should `return` a JSON
// string (objects arrive as lossy grips); use `throw` (or a returned
// `{ok:false}` envelope) to signal failure.
export async function rdpEvalInExtension(
    urlPart: string,
    addonId: string,
    scriptBody: string,
    timeoutMs = 30000,
): Promise<unknown> {
    if (!remoteClient) {
        throw new Error('RDP client not connected (install fixture first)');
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const tabs = (await remoteClient.client.request('listTabs')) as {
            tabs?: RdpTab[];
        };
        const tab = (tabs.tabs ?? []).find(
            (t) => typeof t.url === 'string' && t.url.includes(urlPart),
        );
        if (tab) {
            const target = (await remoteClient.client.request({
                to: tab.actor,
                type: 'getTarget',
            })) as {
                frame?: { webExtensionInspectedWindowActor?: string };
            };
            const actor = target.frame?.webExtensionInspectedWindowActor;
            if (actor) {
                const response = (await remoteClient.client.request({
                    to: actor,
                    type: 'eval',
                    webExtensionCallerInfo: {
                        url: 'e2e-test',
                        lineNumber: 1,
                        addonId,
                    },
                    expression: scriptBody,
                    options: {},
                })) as {
                    evalResult?:
                        | { value?: unknown; exception?: unknown }
                        | unknown;
                    error?: unknown;
                };
                if (
                    response &&
                    typeof response === 'object' &&
                    'error' in response &&
                    response.error !== undefined
                ) {
                    throw new Error(
                        `RDP evaluation failed: ${JSON.stringify(response.error).slice(0, 300)}`,
                    );
                }
                // Values arrive wrapped in a value grip: {value: ...}.
                // (An exception inside the evaluated script surfaces as
                // {exception: ...} instead — surface it loudly.)
                const completed = (response as { evalResult?: unknown })
                    .evalResult;
                if (
                    completed !== null &&
                    typeof completed === 'object' &&
                    'exception' in completed &&
                    (completed as { exception?: unknown }).exception !==
                        undefined
                ) {
                    throw new Error(
                        `RDP evaluation failed: ${JSON.stringify(completed).slice(0, 300)}`,
                    );
                }
                if (
                    completed !== null &&
                    typeof completed === 'object' &&
                    'value' in completed
                ) {
                    return (completed as { value: unknown }).value;
                }
                return completed;
            }
        }
        if (Date.now() > deadline) {
            throw new Error(`no extension target matching ${urlPart} appeared`);
        }
        await new Promise((r) => setTimeout(r, 250));
    }
}

const origins = new Map<string, string>();

// moz-extension origin of an installed extension, from the RDP addon
// record captured at install time.
export async function extensionOrigin(
    context: BrowserContext,
    addonId: string,
): Promise<string> {
    void context;
    const origin = origins.get(addonId);
    if (!origin) {
        throw new Error(`extension ${addonId} was never installed`);
    }
    return origin;
}
