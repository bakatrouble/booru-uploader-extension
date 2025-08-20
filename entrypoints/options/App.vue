<script setup lang="ts">
import { mdiArrowDown, mdiArrowUp, mdiContentSave, mdiDelete, mdiPlus } from '@mdi/js';
import { uuidv4 } from 'uuidv7';
import HotkeyButton from './HotkeyButton.vue';
import { useStorageAsync } from "@vueuse/core";

const uploadLinks = useStorageAsync<UploadLink[]>('uploadLinks', [], {
    getItem: async key => (await browser.storage.sync.get(key))[key],
    setItem: (key, value) => browser.storage.sync.set({ [key]: value }),
    removeItem: key => browser.storage.sync.remove(key),
});
const savedNotification = ref(false);

const getUuid = () => uuidv4();

const save = async () => {
    savedNotification.value = true;
    setTimeout(() => savedNotification.value = false, 3000);
    await browser.runtime.sendMessage({
        type: 'updateContextMenu',
    });
}
</script>

<template>
        <div class="p-4 flex flex-col justify-start">
            <h1 class="text-2xl font-bold mb-4">Booru uploader destinations</h1>
            <transition-group tag="div" class="max-w-6xl relative">
                <div class="row font-bold">
                    <div>Full name</div>
                    <div>Short name</div>
                    <div>URL</div>
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
                            type="text"
                            v-model="item.url"
                        />
                    </div>
                    <div>
                        <hotkey-button v-model="item.hotkey" />
                    </div>
                    <div class="flex items-center">
                        <button class="mr-2" @click="uploadLinks.splice(i - 1, 0, uploadLinks.splice(i, 1)[0])">
                            <mdicon name="arrowUp" />
                        </button>
                        <button class="mr-2" @click="uploadLinks.splice(i + 1, 0, uploadLinks.splice(i, 1)[0])">
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
                    @click="uploadLinks.push({ id: getUuid(), name: '', shortName: '', url: '', hotkey: [] })"
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

    input[type="text"] {
        @apply
            bg-gray-500
            text-gray-50
            p-2
            rounded-sm
            border-gray-700
            border-1;
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
