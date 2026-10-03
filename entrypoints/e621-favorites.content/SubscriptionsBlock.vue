<script setup lang="ts">
import { useWebsite } from "./useWebsite";

const { subscriptions, allTags, el } = defineProps<{
    subscriptions: string[];
    allTags: string[];
    el: string | HTMLElement;
}>();

const relevantSubscriptions = computed(() => {
    return subscriptions.filter(sub => allTags.some(tag => {
        // @ts-ignore
        const escapedTag = RegExp.escape(tag);
        const pattern = `(^-?|[{}|\\s])-?${escapedTag}($|[{}|\\s])`;
        return new RegExp(pattern).test(sub);
    }));
});

const website = useWebsite();
</script>

<template>
    <teleport :to="el">
        <template v-if="website === 'e621'">
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
        </template>
        <template v-else-if="website === 'gelbooru'">
            <li><h3>Subscriptions</h3></li>
            <li
                v-for="sub in relevantSubscriptions"
                :key="sub"
                class="tag-list-item"
            >
                <span>{{ sub }}</span>
            </li>
            <li />
        </template>
    </teleport>
</template>
