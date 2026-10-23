import { createApp } from 'vue';
import '../../styles/popup.sass';
import { mdiClose, mdiLogin, mdiLogout, mdiPlus, mdiRefresh } from '@mdi/js';
import { VueQueryPlugin } from '@tanstack/vue-query';
import mdiVue from 'mdi-vue/v3';
import App from './App.vue';

createApp(App)
    .use(mdiVue, {
        icons: {
            mdiClose,
            mdiLogin,
            mdiLogout,
            mdiPlus,
            mdiRefresh,
        },
    })
    .use(VueQueryPlugin)
    .mount('#app');
