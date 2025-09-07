<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query';

const { el, tag, subscriptions, loading } = defineProps<{
    el: HTMLElement;
    tag: string;
    subscriptions: string[];
    loading: boolean;
}>();

const isSubscribed = computed(() => {
    return subscriptions.includes(tag);
});

const { mutateAsync: toggleMutation, isPending: togglePending } = useMutation({
    mutationFn: async () => {
        await browser.runtime.sendMessage({
            type: isSubscribed.value ? 'removeSubscription' : 'addSubscription',
            tag,
        });
    },
});
</script>

<template>
    <teleport :to="el">
        <a class="tag-list-wiki" href="#" style="padding-right: 2px" @click.prevent="toggleMutation()">
            <template v-if="loading"/>
            <template v-else-if="togglePending">@w@</template>
            <template v-else-if="isSubscribed">XwX</template>
            <template v-else>OwO</template>
        </a>
    </teleport>
</template>
