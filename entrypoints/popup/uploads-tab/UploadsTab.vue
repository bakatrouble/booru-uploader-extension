<script setup lang="ts">

import SectionHeader from '@/components/SectionHeader.vue';
import TaskList from '@/entrypoints/popup/uploads-tab/TaskList.vue';
import { testImage } from '@/entrypoints/popup/testImage';
import { UploadTask } from '@/entrypoints/background';
import AppButton from '@/components/AppButton.vue';
import { useMutation } from '@tanstack/vue-query';

const { queued, processed, port } = defineProps<{
    queued: UploadTask[];
    processed: UploadTask[];
    port?: browser.runtime.Port;
}>();

const loading = ref(false);

onMounted(() => {
    setInterval(() => {
        loading.value = !loading.value;
    }, 500);
})

const { mutate: sendTestImage, isPending: isTestImageSending } = useMutation({
    mutationFn: async () => {
        return await browser.runtime.sendMessage({
            type: 'upload',
            method: 'photoBase64',
            data: testImage,
            endpoint: import.meta.env.VITE_TEST_ENDPOINT,
        });
    },
});
</script>

<template>
    <div class="tab">
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
        <app-button
            v-if="isDev"
            @click="sendTestImage"
            :loading="isTestImageSending"
            style="align-self: end; margin-right: 1rem"
        >
            test
        </app-button>
    </div>
</template>

<style scoped lang="sass">
.tab
    overflow-y: auto
    display: flex
    flex-direction: column
</style>