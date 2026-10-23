import { describe, expect, it, vi } from 'vitest';
import { stubBrowser } from './setup';

// The full tailwind bundle must reach the shadow UI: the SFC styles
// alone only carry @apply-compiled rules, while the template uses plain
// utilities (`flex`, `items-center`, ...) and `@theme` vars
// (`--base-z-index`) that only the bundle defines. Dropping `css:`
// silently unstyles notifications — this pins the wiring.
vi.mock('../../assets/tailwind.css?inline', () => ({
    default: `/* mocked full tailwind */${'x'.repeat(5000)}`,
}));

describe('notifications content-script entry', () => {
    it('passes the stylesheet bundle to the shadow UI', async () => {
        const mount = vi.fn();
        const createShadowRootUi = vi.fn(async () => ({ mount }));
        vi.stubGlobal('createShadowRootUi', createShadowRootUi);
        try {
            const entry = (await import(
                '@/entrypoints/notifications.content/index'
            )) as unknown as {
                default: {
                    main: (ctx: unknown) => Promise<void>;
                };
            };
            await entry.default.main({ onInvalidated: vi.fn() });
            expect(createShadowRootUi).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    css: expect.stringContaining('mocked full tailwind'),
                }),
            );
            expect(mount).toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
            vi.stubGlobal('browser', stubBrowser);
        }
    });
});
