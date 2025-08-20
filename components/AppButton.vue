<script setup lang="ts">
import Spinner from './Spinner.vue';

const { loading, submit, disabled, icon } = defineProps<{
    loading?: boolean;
    submit?: boolean;
    disabled?: boolean;
    active?: boolean;
    icon?: string;
    size?: number;
    noshadow?: boolean;
}>();
const emit = defineEmits<{
    click: [];
}>();
</script>

<template>
    <button
        :class="['btn', { icon, loading, active, noshadow }]"
        :type="submit ? 'submit' : 'button'"
        :disabled
        @click="!disabled && !loading && emit('click')"
    >
        <span class="spinner">
            <spinner v-if="loading" size="20" style="margin-bottom: -3px" />
        </span>

        <span class="content">
            <mdicon v-if="icon" :name="icon" :size />
            <slot v-else />
        </span>
    </button>
</template>

<style scoped lang="sass">
.btn
    position: relative
    border: none
    cursor: pointer
    transition: background-color .2s, opacity .2s, width .2s
    border-radius: 4px
    padding: .5rem 1rem
    font-weight: bold
    text-transform: uppercase
    font-size: v-bind("size || 16") + 'px'
    color: white
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2)
    background: #616161

    &.noshadow
        box-shadow: none

    &.icon
        border-radius: 50%
        aspect-ratio: 1
        padding: .5rem
        background: #fff0

        .mdi
            display: block
            height: v-bind("size || 16") + 'px'

        &:hover
            background-color: #fff2

        &:active
            background-color: #fff4

    &.loading
        opacity: .5
        cursor: default

        .spinner
            opacity: 1

        .content
            opacity: 0

    &[type="submit"], &.active
        background-color: #6200EE

        &:hover
            background-color: #3700B3

    &:disabled
        opacity: .5
        cursor: default

    &:hover
        background: #757575

    .spinner
        position: absolute
        top: 50%
        left: 50%
        transform: translate(-50%, -50%)
        opacity: 0
        transition: opacity .2s

    .content
        transition: opacity .2s
</style>
