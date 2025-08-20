import { createApp } from 'vue';
import Notifications from './Notifications.vue';
import { mdiAlertCircleOutline, mdiCheckBold } from '@mdi/js';
import mdiVue from 'mdi-vue/v3';
import styles from '../../assets/tailwind.css?inline';

export const startApp = (container: HTMLElement | string) => {
    const app = createApp(Notifications)
        .use(mdiVue, {
            icons: {
                mdiCheckBold,
                mdiAlertCircleOutline,
            },
        });
    app.mount(container);
    return app;
}

export default defineContentScript({
    matches: ['*://*/*'],
    cssInjectionMode: 'ui',

    main: async (ctx) => {
        const ui = await createShadowRootUi(ctx, {
            name: 'booru-notifications-ui',
            position: 'inline',
            anchor: 'body',
            css: styles,
            onMount: startApp,
            onRemove: app => {
                app?.unmount();
            }
        });
        ui.mount();
    },
})
