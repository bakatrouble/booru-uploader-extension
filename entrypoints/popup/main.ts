import { createApp } from 'vue';
import '../../styles/popup.sass';
import App from './App.vue';
import mdiVue from 'mdi-vue/v3'
import { mdiClose } from '@mdi/js'

createApp(App)
    .use(mdiVue, {
        icons: {
            mdiClose,
        },
    })
    .mount('#app');
