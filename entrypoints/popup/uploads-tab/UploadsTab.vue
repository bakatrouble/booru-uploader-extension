<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import TaskList from '@/entrypoints/popup/uploads-tab/TaskList.vue';
import { isDev } from '@/utils/env';
import AppButton from '../../../components/AppButton.vue';
import SectionHeader from '../../../components/SectionHeader.vue';
import type { UploadTask } from '../../background/uploader';

const { queued, processed, port } = defineProps<{
    queued: UploadTask[];
    processed: UploadTask[];
    port?: Browser.runtime.Port;
}>();

const showFailedOnly = ref(false);
const visibleProcessed = computed(() =>
    showFailedOnly.value
        ? processed.filter((task) => task.status === 'failed')
        : processed,
);
const { mutate: sendTestImage, isPending: isTestImageSending } = useMutation({
    mutationFn: async () => {
        // Dynamic import guarded by a static DEV check: bundlers drop
        // this branch (and the test image with it) from production builds.
        if (!import.meta.env.DEV) {
            throw new Error(
                'Test uploads are only available in development builds',
            );
        }
        const { loadTestImage } = await import('@/entrypoints/popup/testImage');
        const { buffer, mimeType } = await loadTestImage();
        const { uploadLinks } = (await browser.storage.sync.get(
            'uploadLinks',
        )) as { uploadLinks?: UploadLink[] };
        return await browser.runtime.sendMessage({
            type: 'upload',
            method: 'photoArrayBuffer',
            data: buffer,
            mimeType,
            apiKey:
                uploadLinks?.[0]?.apiKey ||
                import.meta.env.VITE_TEST_API_KEY ||
                '',
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
        <section-header>
            Processed
            <template #action>
                <app-button
                    :active="showFailedOnly"
                    @click="showFailedOnly = !showFailedOnly"
                >
                    Failed only
                </app-button>
            </template>
        </section-header>
        <task-list
            :tasks="visibleProcessed"
            @remove-task="id => port?.postMessage({ type: 'removeTask', id })"
            @retry-task="id => port?.postMessage({ type: 'retryTask', id })"
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