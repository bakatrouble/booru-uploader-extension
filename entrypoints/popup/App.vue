<script lang="ts" setup>

import TaskList from '@/components/TaskList.vue';
import SectionHeader from '@/components/SectionHeader.vue';

const queued = ref<Task[]>([]);
const processed = ref<Task[]>([]);
const port = ref<Browser.runtime.Port>();

onMounted(() => {
    port.value = browser.runtime.connect();
    port.value.onMessage.addListener((message) => {
        if (message.type === 'task_list') {
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
</template>

<style scoped lang="sass">
</style>
