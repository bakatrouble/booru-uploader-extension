<script setup lang="ts">
const { subscriptions, allTags } = defineProps<{
    subscriptions: string[];
    allTags: string[];
}>();

const relevantSubscriptions = computed(() => {
    return subscriptions.filter(sub => allTags.some(tag => {
        const escapedTag = RegExp.escape(tag);
        const pattern = `(^-?|[{}|\\s])-?${escapedTag}($|[{}|\\s])`;
        return new RegExp(pattern).test(sub);
    }));
});
</script>

<template>
    <teleport to="#tag-list, #tag-box">
        <h5>Subscriptions</h5>
        <ul class="tag-list">
            <li
                v-for="sub in relevantSubscriptions"
                :key="sub"
                class="tag-list-item"
            >
                <span style="padding: 0 .25em">{{ sub }}</span>
            </li>
        </ul>
    </teleport>
</template>
