<script setup lang="ts">
import { mdiClose } from '@mdi/js';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import ky from 'ky';
import { computed, inject, type Ref, ref } from 'vue';

const { query, website } = defineProps<{
    query: string;
    website: string;
}>();

const queryClient = useQueryClient();
const authToken = inject<Ref<string | undefined>>('e621-auth-token', ref());

const postUrl = computed(() => {
    const tags = encodeURIComponent(query);
    return website === 'gelbooru'
        ? `https://gelbooru.com/index.php?page=post&s=list&tags=${tags}`
        : `https://e621.net/posts?tags=${tags}`;
});

const client = ky.extend({
    prefix: 'https://e621.bakatrouble.me/api',
    hooks: {
        beforeRequest: [
            (state) => {
                if (authToken.value) {
                    state.request.headers.set('X-API-Key', authToken.value);
                }
            },
        ],
    },
});

const { mutate: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: () => {
        return client
            .delete(`subscriptions?website=${website}`, {
                json: { subs: [query] },
            })
            .json();
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['subs', website] });
    },
    onError: (err) => {
        console.error('Delete subscription failed:', err);
    },
});
</script>

<template>
    <div class="subscription-item">
        <a :href="postUrl" target="_blank" class="query">{{ query }}</a>
        <div style="flex-grow: 1" />
        <button
            @click="() => doDelete()"
            style="margin-left: auto; margin-right: 0.5rem;"
        >
            <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24" style="margin-top: 4px">
                <path :d="mdiClose" />
            </svg>
        </button>
    </div>
</template>

<style scoped lang="sass">
.subscription-item
    display: flex
    align-items: center
    padding: 0.1rem 1rem
    background-color: #3c3c3c
    border-radius: 0.5rem
    margin-bottom: 0.5rem
    min-width: 0

    button
        background: none
        border: none
        color: white
        cursor: pointer
        transition: color 0.25s ease-in-out

        &:hover
            color: #fff8

    .query
        font-size: 16px
        color: white
        transition: text-decoration-color 0.25s ease-in-out
        text-decoration: underline #fff0
        overflow: hidden
        text-overflow: ellipsis
        margin-right: 1rem

        &:hover
            text-decoration-color: #ffff
</style>