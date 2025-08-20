import { createApp } from 'vue';
import { mdiAlertCircleOutline, mdiCheckBold } from '@mdi/js';
import mdiVue from 'mdi-vue/v3';
import NotificationsTest from './NotificationsTest.vue';

const app = createApp(NotificationsTest)
    .use(mdiVue, {
        icons: {
            mdiCheckBold,
            mdiAlertCircleOutline,
        },
    });
app.mount('#app')
