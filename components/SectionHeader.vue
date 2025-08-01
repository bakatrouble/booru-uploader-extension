<script setup lang="ts">
const slots = defineSlots<{ default: () => any[]; action?: () => any[] }>();
</script>

<template>
<div class="section-header">
    <div class="spacer" />
    <div class="title">
        <slot />
    </div>
    <div class="spacer" />
    <div v-if="slots.action">
        <slot name="action" />
    </div>
</div>
</template>

<style scoped lang="sass">
@use "@/styles/colors" as *

.section-header
    display: flex
    flex-direction: row
    align-items: center
    font-weight: bold
    margin-bottom: 1rem

    .spacer
        flex-grow: 1
        height: 1px
        background-color: $separator-color
        margin: 0 .5rem

        &:first-child
            margin-left: 0
            flex-grow: 0
            width: .5rem
</style>