<script lang="ts" setup>

import type { UploadTask } from '@/entrypoints/background';
import TabBar from '@/components/tabs/TabBar.vue';
import Tab from '@/components/tabs/Tab.vue';
import UploadsTab from '@/entrypoints/popup/uploads-tab/UploadsTab.vue';
import E621Tab from '@/entrypoints/popup/e621-tab/E621Tab.vue';
import { useSyncStorage } from '@/utils/useSyncStorage';
import Spinner from '../../components/Spinner.vue';

const queued = ref<UploadTask[]>([]);
const processed = ref<UploadTask[]>([]);
const port = ref<browser.runtime.Port>();

const { storage: initialTab, ready: initialTabReady } = useSyncStorage('initialTab', 0);

onMounted(() => {
    port.value = browser.runtime.connect();
    port.value.onMessage.addListener((message: any) => {
        if (message.type === 'taskList') {
            queued.value = message.queued;
            processed.value = message.processed;
            return {};
        } else if (message.type === 'notification') {
            return null;
        }
    });
})
</script>

<template>
    <tab-bar v-if="initialTabReady" :initialTab @tab-change="initialTab = $event">
        <tab title="Uploads">
            <uploads-tab :queued :processed :port />
        </tab>

        <tab title="e621">
            <e621-tab />
        </tab>
    </tab-bar>
    <spinner v-else />
</template>

<style scoped lang="sass">
</style>
