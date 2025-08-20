<script setup lang="ts">

import Spinner from '../../../components/Spinner.vue';
import type { UploadTask } from '@/entrypoints/background';
import AppButton from '../../../components/AppButton.vue';

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
            <app-button v-if="task.status !== 'processing'" class="remove-btn" icon="close" @click="emit('removeTask', task.id)" />
        </div>
    </div>
    <div v-else class="no-tasks-text">
        No data
    </div>
</template>

<style scoped lang="sass">
@use '@/styles/mixins' as *

.task-list
    display: grid
    grid-gap: .5rem
    grid-template-columns: repeat(3, 1fr)
    grid-auto-rows: 1fr
    width: 100%
    margin: .5rem 0
    padding: 0 1rem

    .task-cell
        display: flex
        aspect-ratio: 1
        position: relative

        &:hover img
            opacity: .3

        img
            @include absolute-stretch
            object-fit: cover
            border-radius: .5rem
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
                margin-bottom: .5rem

        .remove-btn
            position: absolute
            top: 4px
            right: 4px
            opacity: 0
            transition: opacity .2s

            &:hover
                opacity: 1

        &:hover .remove-btn
            opacity: .8

.no-tasks-text
    text-align: center
    margin: .5rem 0

</style>
