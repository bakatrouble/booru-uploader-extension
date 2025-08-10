<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { mdiClose } from '@mdi/js';
import ky from 'ky';

const { query } = defineProps<{
    query: string;
}>();

const queryClient = useQueryClient();
const authToken = inject<Ref<string | undefined>>('e621-auth-token', ref());

const client = ky.extend({
    prefixUrl: 'https://e621.bakatrouble.me/api',
    hooks: {
        beforeRequest: [
            (request) => {
                if (authToken.value) {
                    request.headers.set('Authorization', authToken.value);
                }
            },
        ],
    },
});

const { mutate: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: () => {
        return client(
            'https://e621.bakatrouble.me/api/subscriptions',
            {
                json: { subs: [query] },
            },
        ).json();
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['e621-subs'] });
    },
});

</script>

<template>
    <div class="subscription-item">
        <a :href="`https://e621.net/posts?tags=${encodeURIComponent(query)}`" target="_blank" class="query">{{ query }}</a>
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