import { describe, expect, it } from 'vitest';
import {
    messageHandlerMenus,
    messageHandlerSelector,
    resolveSelectorTarget,
} from '@/entrypoints/image-getter.content';
import { stubBrowser } from './setup';

const mountDom = () => {
    document.body.innerHTML =
        '<img id="plain" src="https://example.test/plain.jpg"><div id="host"></div>';
    const host = document.getElementById('host')!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<img id="inner" src="https://example.test/inner.jpg">';
    return { host, shadow };
};

describe('resolveSelectorTarget', () => {
    it('resolves a plain selector', () => {
        mountDom();
        expect(resolveSelectorTarget('#plain')?.id).toBe('plain');
    });

    it('walks through shadow roots on :: segments', () => {
        mountDom();
        expect(resolveSelectorTarget('#host::#inner')?.id).toBe('inner');
    });

    it('returns undefined when nothing matches', () => {
        mountDom();
        expect(resolveSelectorTarget('#missing')).toBeUndefined();
        expect(resolveSelectorTarget('#host::#missing')).toBeUndefined();
        expect(resolveSelectorTarget('#missing::#inner')).toBeUndefined();
    });
});

describe('message handlers', () => {
    it('messageHandlerSelector throws when the target is missing', async () => {
        mountDom();
        await expect(messageHandlerSelector('#missing')).rejects.toThrow(
            'No target element found',
        );
    });

    it('messageHandlerMenus throws when there is no target element', async () => {
        stubBrowser.contextMenus.getTargetElement.mockReturnValueOnce(null);
        await expect(messageHandlerMenus(123)).rejects.toThrow(
            'No target element found',
        );
    });
});
