<script lang="ts" setup>
import Tab from '@/components/tabs/Tab.vue';
import TabBar from '@/components/tabs/TabBar.vue';
import UploadsTab from '@/entrypoints/popup/uploads-tab/UploadsTab.vue';
import { useSyncStorage } from '@/utils/useSyncStorage';
import Spinner from '../../components/Spinner.vue';
import type { UploadTask } from '../background/uploader';
import SubscriptionsTab from './e621-tab/SubscriptionsTab.vue';

const queued = ref<UploadTask[]>([]);
const processed = ref<UploadTask[]>([]);
const port = ref<Browser.runtime.Port>();

const { storage: initialTab, ready: initialTabReady } = useSyncStorage(
    'initialTab',
    0,
);

onMounted(() => {
    port.value = browser.runtime.connect({ name: 'uploader' });
    port.value.onMessage.addListener((message: any) => {
        if (message.type === 'taskList') {
            queued.value = message.queued;
            processed.value = message.processed;
            return {};
        } else if (message.type === 'notification') {
            return null;
        }
    });
});
</script>

<template>
    <tab-bar v-if="initialTabReady" :initialTab @tab-change="initialTab = $event">
        <tab title="Uploads">
            <uploads-tab :queued :processed :port />
        </tab>

        <tab title="e621">
            <subscriptions-tab website="e621" />
        </tab>

        <tab title="Gelbooru">
            <subscriptions-tab website="gelbooru" />
        </tab>
    </tab-bar>
    <spinner v-else />
</template>

<style scoped lang="sass">
</style>
