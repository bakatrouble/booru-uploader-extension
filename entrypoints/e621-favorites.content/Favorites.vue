<script setup lang="ts">
import OwO from './OwO.vue';
import SubscriptionsBlock from './SubscriptionsBlock.vue';
import { useWebsite } from "./useWebsite";

const tagElements = ref<[HTMLElement, string][]>([]);
const loading = ref(true);
const subscriptions = ref<string[]>([]);
const allTags = ref<string[]>([]);
const port = ref<browser.runtime.Port | null>(null);

const website = useWebsite();

onMounted(async () => {
    let { apiKey } = await browser.storage.sync.get('apiKey');
    if (!apiKey) {
        apiKey = import.meta.env.VITE_API_KEY;
    }
    if (!apiKey) {
        loading.value = false;
        return;
    }

    const allTagsArray: string[] = [];
    switch (website.value) {
        case 'gelbooru':
            tagElements.value = Array.from(document.querySelectorAll('.tag-list > li[class^=tag-type]'))
                .map(el => {
                    const elPrefix = document.createElement("div");
                    elPrefix.style.display = 'contents';
                    el.insertBefore(elPrefix, el.firstChild);
                    const urlParts = el.querySelector('a:last-of-type')!.getAttribute('href')!.split('=');
                    const tagName = decodeURIComponent(urlParts[urlParts.length - 1]);
                    allTagsArray.push(tagName);
                    return [elPrefix as HTMLElement, tagName]
                });
            break;
        case 'e621':
            tagElements.value = Array.from(document.querySelectorAll('.tag-list-item'))
                .map(el => {
                    const elPrefix = document.createElement("div");
                    elPrefix.style.display = 'contents';
                    el.insertBefore(elPrefix, el.firstChild);
                    const tagName = decodeURIComponent(el.getAttribute('data-name')!);
                    allTagsArray.push(tagName);
                    return [elPrefix as HTMLElement, tagName]
                });
            break;
    }

    allTags.value = allTagsArray;

    port.value = browser.runtime.connect({ name: 'subscriptions' });
    port.value.onMessage.addListener((message: any) => {
        console.log(message.subscriptions, website.value);
        subscriptions.value = message.subscriptions[website.value] || [];
        console.log(message.subscriptions[website.value] || []);
        loading.value = false;
    });
});

const subscriptionsBlockSelector = computed(() => {
    switch (website.value) {
        case 'e621':
            return '#tag-list, #tag-box';
        case 'gelbooru':
            const statisticsHeader = document.querySelector('.tag-list > li > h3');
            const statisticsLi = statisticsHeader?.parentElement;
            const blockEl = document.createElement("div");
            statisticsLi?.parentElement?.insertBefore(blockEl, statisticsLi);
            return blockEl;
    }
})

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
    <subscriptions-block v-if="!loading" :el="subscriptionsBlockSelector" :subscriptions="subscriptions" :all-tags />
</template>
