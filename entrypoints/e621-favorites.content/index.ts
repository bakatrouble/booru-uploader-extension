import { VueQueryPlugin } from '@tanstack/vue-query';
import Favorites from './Favorites.vue';

export default defineContentScript({
    matches: ['*://e621.net/*', '*://e926.net/*', '*://gelbooru.com/*'],

    main: async (ctx) => {
        const ui = createIntegratedUi(ctx, {
            position: 'inline',
            anchor: 'body',
            onMount(container) {
                const app = createApp(Favorites).use(VueQueryPlugin);
                app.mount(container);
                return app;
            },
            onRemove(app) {
                app?.unmount();
            },
        });
        ui.autoMount();
    },
});
