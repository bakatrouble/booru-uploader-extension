<script setup lang="ts">

import Spinner from '@/components/Spinner.vue';
import type { UploadTask } from '@/entrypoints/background';

const { tasks } = defineProps<{
    tasks: UploadTask[];
}>();

const emit = defineEmits<{
    removeTask: [id: string];
}>();
</script>

<template>
    <div v-if="tasks.length > 0" class="task-list">
        <div v-for="task in tasks" class="task-cell">
            <img v-if="task.type === 'photoFile'" :src="task.file!" />
            <div class="task-status-container">
                <spinner v-if="['pending', 'processing'].includes(task.status)" size="30" color="white" class="task-spinner" />
                <span>{{ task.status }}</span>
            </div>
            <button v-if="task.status !== 'processing'" class="remove-btn" @click="emit('removeTask', task.id)">
                <mdicon name="close" size="20" />
            </button>
        </div>
    </div>
    <div v-else class="no-tasks-text">
        No data
    </div>
</template>

<style scoped lang="sass">
@use '@/styles/mixins.sass' as *

.task-list
    display: grid
    grid-gap: 8px
    grid-template-columns: repeat(3, 1fr)
    grid-auto-rows: 1fr
    width: 100%
    margin: 8px 0

    .task-cell
        display: flex
        aspect-ratio: 1
        position: relative

        &:hover img
            opacity: .3

        img
            @include absolute-stretch
            object-fit: cover
            border-radius: 8px
            opacity: .5
            transition: opacity .5s

        .task-status-container
            @include absolute-stretch
            display: flex
            flex-direction: column
            justify-content: center
            align-items: center
            pointer-events: none
            font-size: 14px

            .task-spinner
                margin-bottom: 8px

        .remove-btn
            position: absolute
            top: 4px
            right: 4px
            cursor: pointer
            opacity: 0
            transition: opacity .2s
            aspect-ratio: 1

            &:hover
                opacity: 1

        &:hover .remove-btn
            opacity: .8

.no-tasks-text
    text-align: center
    margin: 8px 0

</style>
