<script setup lang="ts">

</script>

<template>
<div class="section-header">
    <slot />
</div>
</template>

<style scoped lang="sass">
@use "@/styles/colors" as *

.section-header
    display: flex
    flex-direction: row
    align-items: center
    font-weight: bold

    &:after
        content: ''
        flex-grow: 1
        height: 1px
        background-color: $separator-color
        margin-left: 8px
</style>