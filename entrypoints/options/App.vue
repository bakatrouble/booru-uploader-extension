<script setup lang="ts">
import {
    mdiArrowDown,
    mdiArrowUp,
    mdiClose,
    mdiKeyboard,
    mdiPlus,
} from '@mdi/js';
import { useStorageAsync } from '@vueuse/core';
import { uuidv4 } from 'uuidv7';
import { DEFAULT_API_ROOT } from '@/utils/apiRoot';
import {
    isValidEndpointUrl,
    moveUploadLink,
    normalizeUploadLinks,
} from '@/utils/uploadLinks';
import { browserSyncStorage } from '@/utils/useSyncStorage';
import HotkeyButton from './HotkeyButton.vue';

const apiRoot = useStorageAsync<string>(
    'apiRoot',
    DEFAULT_API_ROOT,
    browserSyncStorage,
);
const uploadLinks = useStorageAsync<UploadLink[]>(
    'uploadLinks',
    [],
    browserSyncStorage,
);

const getUuid = () => uuidv4();

const notifyBackground = () => {
    void browser.runtime
        .sendMessage({ type: 'updateContextMenu' })
        .catch(() => {});
};

// Drop the pre-migration `url` field once the stored list loads.
watch(
    uploadLinks,
    (links) => {
        if (!Array.isArray(links)) return;
        if (
            links.some(
                (l) => 'url' in (l as unknown as Record<string, unknown>),
            )
        ) {
            uploadLinks.value = normalizeUploadLinks(links);
        }
    },
    { immediate: true },
);

// Persisted automatically by useStorageAsync; just refresh the menus.
watch([apiRoot, uploadLinks], notifyBackground, { deep: true });
</script>

<template>
        <div class="p-4 flex flex-col justify-start">
            <h1 class="text-2xl font-bold mb-4">Booru uploader destinations</h1>
            <div class="max-w-6xl mb-4">
                <label class="font-bold block mb-1" for="api-root">API root</label>
                <input
                    id="api-root"
                    type="text"
                    v-model="apiRoot"
                    placeholder="http://127.0.0.1:8080"
                    :class="{ invalid: apiRoot && !isValidEndpointUrl(apiRoot) }"
                />
                <div
                    v-if="apiRoot && !isValidEndpointUrl(apiRoot)"
                    class="url-error"
                >
                    Must be an absolute http(s) URL
                </div>
            </div>
            <transition-group tag="div" class="max-w-6xl relative">
                <div class="row font-bold">
                    <div>Full name</div>
                    <div>Short name</div>
                    <div>API key</div>
                    <div>Hotkey</div>
                    <div />
                </div>
                <div class="row" v-for="(item, i) in uploadLinks" :key="item.id">
                    <div>
                        <input
                            type="text"
                            v-model="item.name"
                        />
                    </div>
                    <div>
                        <input
                            type="text"
                            v-model="item.shortName"
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            v-model="item.apiKey"
                            autocomplete="off"
                            placeholder="x-key"
                        />
                    </div>
                    <div>
                        <hotkey-button v-model="item.hotkey" />
                    </div>
                    <div class="flex items-center">
                        <button class="mr-2" @click="moveUploadLink(uploadLinks, i, -1)">
                            <mdicon name="arrowUp" />
                        </button>
                        <button class="mr-2" @click="moveUploadLink(uploadLinks, i, 1)">
                            <mdicon name="arrowDown" />
                        </button>
                        <button class="red" @click="uploadLinks.splice(i, 1)">
                            <mdicon name="close" />
                        </button>
                    </div>
                </div>
            </transition-group>
            <span>
                <button
                    class="mr-2 flex flex-row "
                    @click="uploadLinks.push({ id: getUuid(), name: '', shortName: '', apiKey: '', hotkey: [] })"
                >
                    <mdicon name="plus" /> Add
                </button>
            </span>
        </div>
</template>

<style lang="css">
@import "../../assets/tailwind.css";

@layer components {
    body {
        @apply
            bg-gray-800
            text-gray-50;
    }

    input[type="text"],
    input[type="password"] {
        @apply
            bg-gray-500
            text-gray-50
            p-2
            rounded-sm
            border-gray-700
            border-1;

        &.invalid {
            @apply
                border-red-500
                border-2;
        }
    }

    .url-error {
        @apply
            text-red-400
            text-sm
            mt-1;
    }

    button {
        @apply
            p-2
            rounded-sm
            cursor-pointer
            bg-blue-500
            hover:bg-blue-600
            hover:active:bg-blue-500;

        &.red {
            @apply
                bg-red-500
                hover:bg-red-600
                hover:active:bg-red-500
        }
    }

    .row {
        @apply
            flex
            flex-row
            gap-2
            mb-2
            transition-all;

        & > * {
            @apply
                w-xl;
        }
    }
}
</style>
