import { mdiAlertCircleOutline, mdiCheckBold } from '@mdi/js';
import mdiVue from 'mdi-vue/v3';
import { createApp } from 'vue';
import Notifications from './Notifications.vue';

export default defineContentScript({
    matches: ['*://*/*'],
    cssInjectionMode: 'ui',

    main: async (ctx) => {
        const ui = await createShadowRootUi(ctx, {
            name: 'booru-notifications-ui',
            position: 'inline',
            anchor: 'body',
            onMount: (container) => {
                const app = createApp(Notifications).use(mdiVue, {
                    icons: {
                        mdiCheckBold,
                        mdiAlertCircleOutline,
                    },
                });
                app.mount(container);
                return app;
            },
            onRemove: (app) => {
                app?.unmount();
            },
        });
        ui.mount();
    },
});
