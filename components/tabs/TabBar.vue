<script setup lang="ts">
import Tab from './Tab.vue';
import AppButton from '../AppButton.vue';

const { initialTab } = defineProps<{ initialTab?: number }>();
const emit = defineEmits<{ tabChange: [number] }>();

const slots = defineSlots<{ default: () => any[] }>();
const tabs = slots.default().filter(tab => tab?.type.__file === Tab.__file);

const activeTab = ref(initialTab || 0);
</script>

<template>
    <div class="tab-bar">
        <app-button
            v-for="(tab, index) in tabs"
            :key="index"
            :active="activeTab === index"
            @click="activeTab = index; emit('tabChange', index)"
        >
            {{ tab.props.title }}
        </app-button>
    </div>
    <component :is="tabs[activeTab]" />
</template>

<style scoped lang="sass">
    .tab-bar
        display: grid
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr))
        gap: .5rem
        padding: 0 1rem
        margin: 0 0 1rem
</style>
