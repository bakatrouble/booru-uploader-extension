<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import SectionHeader from '../../../components/SectionHeader.vue';
import Modal from '../../../components/Modal.vue';
import AppButton from '../../../components/AppButton.vue';
import SubscriptionItem from '@/entrypoints/popup/e621-tab/SubscriptionItem.vue';
import { useVirtualList } from '@vueuse/core';
import { useSyncStorage } from '@/utils/useSyncStorage';
import ky, { HTTPError } from 'ky';

const { website } = defineProps<{
    website: string;
}>();

const loginModalOpen = ref(false);
const addModalOpen = ref(false);
const apiKeyInput = ref('');
const newSubscription = ref('');
const filter = ref('');

const queryClient = useQueryClient();

const { storage: authToken, ready: authTokenReady } = useSyncStorage('apiKey', import.meta.env.VITE_API_KEY || '');
const isAuthenticated = computed(() => !!authToken.value);
provide('e621-auth-token', authToken);

const client = ky.extend({
    prefixUrl: 'https://e621.bakatrouble.me/api',
    hooks: {
        beforeRequest: [
            (request) => {
                if (authToken.value) {
                    request.headers.set('X-API-Key', authToken.value);
                }
            },
        ],
    },
});

const { mutate: signIn, isPending: signInPending, error: signInError } = useMutation({
    mutationFn: async () => {
        try {
            await client.get(`subscriptions?website=${website}`, {
                headers: {
                    'X-API-Key': apiKeyInput.value
                }
            }).json();
            return true;
        } catch (e) {
            if (e instanceof HTTPError) {
                const responseJson = await e.response?.json?.();
                if (responseJson?.message) {
                    throw new Error(responseJson.message);
                }
            }
            throw e;
        }
    },
    onSuccess: async () => {
        authToken.value = apiKeyInput.value;
        loginModalOpen.value = false;
        apiKeyInput.value = '';
    },
    onError: (err) => {
        console.error('Login failed:', err);
    },
});

const { mutate: signOut } = useMutation({
    mutationFn: async () => {
        authToken.value = null;
    }
})

const { data, isLoading, error } = useQuery({
    queryKey: ['subs', website],
    queryFn: async () => {
        if (!authToken.value) {
            return [];
        }
        const data = await client.get(`subscriptions?website=${website}`).json() as { subscriptions: string[] };
        return data.subscriptions as string[];
    },
    enabled: isAuthenticated,
});
const filteredData = computed(() => {
    if (!data.value) return [];
    return data.value.filter(query => query.toLowerCase().includes(filter.value.toLowerCase()));
});
const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(filteredData, {
    itemHeight: 29,
});
watch([filter], () => {
    scrollTo(0);
});

const { mutate: addSubscription, isPending: addPending } = useMutation({
    mutationFn: () => {
        if (!authToken.value) {
            throw new Error('Not authenticated');
        }
        return client.post(
            `subscriptions?website=${website}`,
            {
                json: {
                    subs: [newSubscription.value]
                },
            },
        ).json();
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['e621-subs'] });
        addModalOpen.value = false;
        newSubscription.value = '';
    },
});

</script>

<template>
    <div class="tab">
        <section-header>
            Subscriptions
            <template #action>
                <app-button v-if="!authToken" icon="login" @click="loginModalOpen = true" />
                <template v-else>
                    <app-button icon="plus" @click="addModalOpen = true" style="margin-right: .5rem" />
                    <app-button icon="logout" @click="signOut()" />
                </template>
            </template>
        </section-header>

        <template v-if="authTokenReady">
            <div v-if="isLoading">Loading...</div>
            <div v-else-if="error">{{ error.message }}</div>
            <div v-else-if="!isAuthenticated" class="error-message">Sign in required</div>
            <div v-else class="sub-list-outer">
                <div class="sub-filter">
                    <input v-model="filter" placeholder="Filter" />
                </div>
                <div v-bind="containerProps" class="sub-list-container">
                    <div v-bind="wrapperProps" class="sub-list-wrapper">
                        <subscription-item
                            v-for="item in list"
                            :key="item.index"
                            :query="item.data"
                            :website="website"
                        />
                    </div>
                </div>
            </div>
        </template>

        <modal
            title="Sign in"
            :open="loginModalOpen"
            @close="() => { if (!signInPending) { loginModalOpen = false; apiKeyInput = ''; } }"
        >
            <form class="form" @submit.prevent="signIn()">
                <input type="text" v-model="apiKeyInput" placeholder="API key" />
                <div v-if="signInError" class="error-message">
                    <code v-if="(signInError as Error)?.message">
                        {{ (signInError as Error)?.message }}
                    </code>
                    <div v-else>{{ signInError.message }}</div>
                </div>
                <div class="actions">
                    <app-button type="submit" :loading="signInPending">
                        Sign In
                    </app-button>
                </div>
            </form>
        </modal>

        <modal
            title="Add Subscription"
            :open="addModalOpen"
            @close="() => { if (!addPending) { addModalOpen = false; newSubscription = ''; } }"
        >
            <form class="form" @submit.prevent="addSubscription()">
                <input type="text" v-model="newSubscription" placeholder="Query" />
                <div class="actions">
                    <app-button type="submit" :loading="addPending">
                        Add
                    </app-button>
                </div>
            </form>
        </modal>
    </div>
</template>

<style scoped lang="sass">
@use "@/styles/colors" as *

.tab
    flex-grow: 1
    overflow: hidden
    display: flex
    flex-direction: column

.error-message
    padding: .5rem 1rem
    border-radius: .5rem
    background-color: #B00020
    font-size: 15px

.form
    display: flex
    flex-direction: column
    gap: .5rem

    .actions
        margin-top: .5rem
        display: flex
        flex-direction: row
        justify-content: flex-end

input
    padding: .5rem
    border: 2px solid #fff2
    border-radius: 4px
    background: $background-color
    font-size: 1rem

    &:focus
        border-color: #fff5
        outline: none

.sub-list-outer
    flex-grow: 1
    display: flex
    flex-direction: column
    align-items: stretch
    overflow: hidden

    .sub-filter
        margin: 0 1rem 1rem
        display: flex
        flex-direction: column
        justify-content: stretch

    .sub-list-container
        flex-grow: 1

        .sub-list-wrapper
            padding: 0 1rem

</style>