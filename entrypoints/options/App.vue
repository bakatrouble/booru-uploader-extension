<script setup lang="ts">
import { mdiArrowDown, mdiArrowUp, mdiContentSave, mdiDelete, mdiPlus } from '@mdi/js';
import _ from 'lodash';
import { onMounted, reactive } from 'vue';
import { uuidv4 } from 'uuidv7';
import HotkeyButton from './HotkeyButton.vue';

const data = reactive({
    uploadLinks: [] as UploadLink[],
    savedNotification: false,
});

onMounted(async () => {
    const savedData = await browser.storage.sync.get([
        'uploadLinks',
    ]);
    data.uploadLinks = savedData.uploadLinks ?? [] as UploadLink[];
});

const getUuid = () => uuidv4();

const save = async () => {
    await browser.storage.sync.set({
        uploadLinks: _.cloneDeep(data.uploadLinks),
    });
    data.savedNotification = true;
    await browser.runtime.sendMessage({
        type: 'updateContextMenu',
    });
}
</script>

<template>
    <v-app>
        <v-main class="pa-2 d-flex flex-column justify-start">
            <h1 class="text-h4">Image Galleries</h1>
            <v-sheet class="pa-2" rounded>
                <h2 class="text-h6 mb-4">Set up upload links</h2>
                <div class="table w-100">
                    <template v-for="(item, i) in data.uploadLinks" :key="item.id">
                        <div class="table-row">
                            <span>
                                <v-text-field
                                    v-model="item.name"
                                    variant="solo-filled"
                                    label="Name"
                                />
                            </span>
                            <span>
                                <v-text-field
                                    v-model="item.shortName"
                                    variant="solo-filled"
                                    label="Short name"
                                />
                            </span>
                            <span>
                                <v-text-field
                                    v-model="item.url"
                                    variant="solo-filled"
                                    label="URL"
                                />
                            </span>
                            <span>
                                <hotkey-button v-model="item.hotkey" />
                            </span>
                            <span class="d-flex align-center">
                                <v-btn
                                    variant="text"
                                    :icon="mdiArrowUp"
                                    @click="data.uploadLinks.splice(i - 1, 0, data.uploadLinks.splice(i, 1)[0])"
                                />
                                <v-btn
                                    variant="text"
                                    :icon="mdiArrowDown"
                                    @click="data.uploadLinks.splice(i + 1, 0, data.uploadLinks.splice(i, 1)[0])"
                                />
                                <v-btn
                                    variant="text"
                                    color="red"
                                    :icon="mdiDelete"
                                    @click="data.uploadLinks.splice(i, 1)"
                                />
                            </span>
                        </div>
                    </template>
                    <div class="table-row">
                        <span>
                            <v-btn
                                class="mr-2"
                                :prepend-icon="mdiPlus"
                                @click="data.uploadLinks.push({ id: getUuid(), name: '', shortName: '', url: '', hotkey: [] })"
                            >
                                Add
                            </v-btn>
                        </span>
                    </div>
                </div>
            </v-sheet>
            <v-sheet rounded class="align-self-end mt-2 pa-2">
                <v-btn
                    :prepend-icon="mdiContentSave"
                    color="primary"
                    @click="save"
                >
                    Save
                </v-btn>
            </v-sheet>
            <v-snackbar
                v-model="data.savedNotification"
                color="green"
                location="bottom right"
                :timeout="3000"
                @click="data.savedNotification = false"
            >
                Settings saved
            </v-snackbar>
        </v-main>
    </v-app>
</template>

<style scoped lang="sass">
.table
    max-width: 1024px
    display: grid
    grid-template-columns: repeat(4, 1fr) auto
    grid-column-gap: 8px
    grid-row-gap: 8px

    .v-sheet, .table-row
        display: contents
</style>

<style lang="sass">
.v-input__details
    display: none
</style>
