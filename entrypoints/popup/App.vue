<script lang="ts" setup>

import TaskList from '@/components/TaskList.vue';
import SectionHeader from '@/components/SectionHeader.vue';
import { testImage } from '@/entrypoints/popup/testImage';
import type { UploadTask } from '@/entrypoints/background';

const queued = ref<UploadTask[]>([]);
const processed = ref<UploadTask[]>([]);
const port = ref<Browser.runtime.Port>();

const isDev = import.meta.env.DEV;

const sendTestImage = async () => {
    console.log(await browser.runtime.sendMessage({
        type: 'photoBase64',
        data: testImage,
        endpoint: 'https://bots.bakatrouble.me/bots_rpc/nsfw/',
    }));
}

onMounted(() => {
    port.value = browser.runtime.connect();
    port.value.onMessage.addListener((message) => {
        if (message.type === 'taskList') {
            queued.value = message.queued;
            processed.value = message.processed;
        }
    });
})
</script>

<template>
    <section-header>Pending</section-header>
    <task-list
        :tasks="queued"
        @remove-task="id => port?.postMessage({ type: 'removeTask', id })"
    />
    <section-header>Processed</section-header>
    <task-list
        :tasks="processed"
        @remove-task="id => port?.postMessage({ type: 'removeTask', id })"
    />
    <button v-if="isDev" @click="sendTestImage">test</button>
</template>

<style scoped lang="sass">
</style>
