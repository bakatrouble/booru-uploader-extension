import { createApp } from 'vue';
import '../../styles/popup.sass';
import App from './App.vue';
import mdiVue from 'mdi-vue/v3'
import { mdiClose, mdiLogin, mdiLogout, mdiPlus } from '@mdi/js'
import { VueQueryPlugin } from '@tanstack/vue-query';

createApp(App)
    .use(mdiVue, {
        icons: {
            mdiClose,
            mdiLogin,
            mdiLogout,
            mdiPlus,
        },
    })
    .use(VueQueryPlugin)
    .mount('#app');
