<script setup lang="ts">
import OwO from './OwO.vue';
import SubscriptionsBlock from './SubscriptionsBlock.vue';

const tagElements = ref<[HTMLElement, string][]>([]);
const loading = ref(true);
const subscriptions = ref<string[]>([]);
const allTags = ref<string[]>([]);
const port = ref<browser.runtime.Port | null>(null);

onMounted(async () => {
    const { apiKey } = await browser.storage.sync.get('apiKey');
    if (!apiKey) {
        loading.value = false;
        return;
    }

    const allTagsArray: string[] = [];
    tagElements.value = Array.from(document.querySelectorAll('.tag-list-item'))
        .map(el => {
            const elPrefix = document.createElement("div");
            elPrefix.style.display = 'contents';
            el.insertBefore(elPrefix, el.firstChild);
            const tagName = decodeURIComponent(el.getAttribute('data-name')!);
            allTagsArray.push(tagName);
            return [elPrefix as HTMLElement, tagName]
        });
    allTags.value = allTagsArray;

    port.value = browser.runtime.connect({ name: 'subscriptions' });
    port.value.onMessage.addListener((message: any) => {
        subscriptions.value = message.subscriptions;
        console.log(message.subscriptions);
        loading.value = false;
    });
});

</script>

<template>
    <ow-o
        v-for="([el, tag]) in tagElements"
        :key="tag"
        :el="el"
        :tag
        :subscriptions
        :loading
    />
    <subscriptions-block v-if="!loading" :subscriptions="subscriptions" :all-tags />
</template>
