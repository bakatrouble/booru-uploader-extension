<script setup lang="ts">
import SectionHeader from '@/components/SectionHeader.vue';
import AppButton from '@/components/AppButton.vue';

const { open, title } = defineProps<{
    open?: boolean;
    title?: string;
}>();
const emit = defineEmits<{
    close: [],
}>();
</script>

<template>
    <div :class="['modal-wrapper', open && 'active']">
        <div class="backdrop" @click="emit('close')" />
        <div class="modal">
            <section-header class="header">
                {{ title }}
                <template #action>
                    <app-button icon="close" @click="emit('close')" />
                </template>
            </section-header>
            <slot />
        </div>
    </div>
</template>

<style scoped lang="sass">
    @use "@/styles/colors" as *

    .modal-wrapper
        position: fixed
        top: 0
        left: 0
        right: 0
        bottom: 0
        display: flex
        align-items: center
        justify-content: center
        z-index: 1000
        pointer-events: none
        opacity: 0
        transition: opacity 0.2s ease-in-out
        padding: 80px

        &.active
            pointer-events: auto
            opacity: 1

        .backdrop
            position: absolute
            top: 0
            left: 0
            width: 100%
            height: 100%
            background-color: #0005

        .modal
            flex-grow: 1
            position: relative
            background-color: $background-color
            padding: 20px
            border-radius: .5rem
            box-shadow: 0 4px .5rem rgba(0, 0, 0, 0.2)
            z-index: 1001
            max-width: 400px
            max-height: 400px

            .header
                margin-bottom: 1rem

</style>
