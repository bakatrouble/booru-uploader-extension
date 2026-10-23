import { beforeEach, vi } from 'vitest';

// Minimal stub of the WebExtension `browser` global used by background
// scripts, content scripts and components. Individual tests override
// behavior via the exported handles.
const storageData: Record<string, unknown> = {};

const menusCreated: any[] = [];
let menusClickListener: ((...args: any[]) => unknown) | undefined;

const stubBrowser = {
    storage: {
        sync: {
            get: vi.fn(async (keys: string | string[]) => {
                if (Array.isArray(keys)) {
                    return Object.fromEntries(
                        keys.map((k) => [k, storageData[k]]),
                    );
                }
                return { [keys]: storageData[keys] };
            }),
            set: vi.fn(async (items: Record<string, unknown>) => {
                Object.assign(storageData, items);
            }),
            remove: vi.fn(async (key: string) => {
                delete storageData[key];
            }),
        },
    },
    contextMenus: {
        create: vi.fn((options: any) => {
            menusCreated.push(options);
            return options.id ?? options.title;
        }),
        remove: vi.fn(async () => {}),
        getTargetElement: vi.fn(() => null),
        onClicked: {
            addListener: vi.fn((listener: (...args: any[]) => unknown) => {
                menusClickListener = listener;
            }),
        },
    },
    tabs: {
        create: vi.fn(async () => ({})),
        sendMessage: vi.fn(async (..._args: any[]): Promise<any> => undefined),
        query: vi.fn(async () => []),
    },
    runtime: {
        sendMessage: vi.fn(async (..._args: any[]): Promise<any> => undefined),
        openOptionsPage: vi.fn(async () => {}),
        getURL: vi.fn((path: string) => `moz-extension://test/${path}`),
        onMessage: {
            addListener: vi.fn((..._args: any[]) => {}),
        },
        onMessageExternal: {
            addListener: vi.fn(() => {}),
        },
        onConnect: {
            addListener: vi.fn(() => {}),
        },
        connect: vi.fn(() => ({
            postMessage: vi.fn(),
            onMessage: { addListener: vi.fn() },
            onDisconnect: { addListener: vi.fn() },
        })),
    },
    browserAction: {
        setBadgeBackgroundColor: vi.fn(),
        setBadgeText: vi.fn(async () => {}),
        setIcon: vi.fn(async () => {}),
    },
};

vi.stubGlobal('browser', stubBrowser);

// WXT entrypoint-definition globals. Stubbed as identity so Node-side code
// (background scripts, content scripts) can be imported in unit tests
// without the WXT build.
vi.stubGlobal('defineBackground', (definition: unknown) => definition);
vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
vi.stubGlobal('defineUnlistedScript', (definition: unknown) => definition);

beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageData)) delete storageData[k];
    menusCreated.length = 0;
    menusClickListener = undefined;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
});

export { menusCreated, storageData, stubBrowser };

export const getMenusClickListener = () => menusClickListener;
