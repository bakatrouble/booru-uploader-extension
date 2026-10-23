<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { UploadTask } from '@/entrypoints/background/uploader';
import { readTaskThumbnail } from '@/utils/imageStore';

const { task } = defineProps<{
    task: UploadTask;
}>();

// Remote tasks carry a usable URL; file tasks resolve their stored
// thumbnail (falling back to the full blob) from IndexedDB.
const src = ref<string | undefined>(
    task.type === 'photoFile' ? undefined : task.url,
);
let objectUrl: string | undefined;

onMounted(async () => {
    if (task.type !== 'photoFile') return;
    const blob = await readTaskThumbnail(task.id);
    if (blob) {
        objectUrl = URL.createObjectURL(blob);
        src.value = objectUrl;
    }
});

onUnmounted(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
});
</script>

<template>
    <img v-if="src" :src="src" />
</template>
