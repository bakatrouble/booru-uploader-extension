<script setup lang="ts">
import {mdiAlertCircleOutline, mdiCheckBold} from '@mdi/js';
import {computed, nextTick, onMounted, onUnmounted, reactive, ref, watch} from 'vue'
import {VIcon, VSnackbar} from 'vuetify/components';
import { uuidv4 } from 'uuidv7';
import { NotificationLevel } from '@/utils/enums';

const data = reactive({
    notifications: [] as NotificationEntry[],
    heights: {} as { [key: string]: number },
});
const $el = useTemplateRef<HTMLDivElement>('el');

const offsets = computed(() => {
    const offsets = [] as number[];
    let offset = 0;
    for (const notification of data.notifications) {
        offsets.push(offset);
        if (!notification.visible) {
            continue;
        }
        offset += data.heights[notification.id] + 16;
    }
    console.log(offsets);
    return offsets;
});

const pushNotification = async (options: NotificationOptions) => {
    const id = uuidv4();
    data.notifications.push({
        ...options,
        visible: true,
        id,
    });
    return id;
}

const updateNotification = async (options: UpdateNotificationOptions) => {
    const idx = data.notifications.findIndex(n => n.id === options.id);
    if (idx !== -1) {
        data.notifications[idx].level = options.level;
        data.notifications[idx].message = options.message;
        data.notifications[idx].title = options.title;
    }
}

const messageHandler = (message: RuntimeMessage) => {
    console.log('message received', message);
    if (message.type === 'notification') {
        return pushNotification(message.options);
    } else if (message.type === 'update-notification') {
        return updateNotification(message.options);
    }
}

onMounted(() => {
    console.log('Notifications mounted');

    browser.runtime.onMessage.addListener(messageHandler);
});

const getIcon = (notification: NotificationOptions) => {
    switch (notification.level) {
    case NotificationLevel.Success:
        return mdiCheckBold;
    case NotificationLevel.Error:
        return mdiAlertCircleOutline;
    }
};

const getColor = (notification: NotificationOptions) => {
    switch (notification.level) {
    case NotificationLevel.Success:
        return 'green';
    case NotificationLevel.Error:
        return 'red';
    case NotificationLevel.Loading:
        return 'grey';
    }
};

watch(
    () => data.notifications,
    async (notifications: NotificationEntry[]) => {
        await nextTick();
        const heights = {} as { [key: string]: number };
        notifications.forEach(n => {
            const el = $el.value!.querySelector(`.v-snackbar-${n.id} .v-snackbar__wrapper`);
            heights[n.id] = el?.clientHeight || 0;
        });
        data.heights = heights;
    },
    { deep: true },
);
</script>

<template>
    <v-theme-provider>
        <v-locale-provider ltr>
            <div ref="el">
                <template v-for="(notification, idx) in data.notifications" :key="notification.id">
                    <v-snackbar
                        ref="snackbar"
                        v-model="notification.visible"
                        :color="getColor(notification)"
                        :timeout="notification.level !== NotificationLevel.Loading ? 5000 : -1"
                        :class="`v-snackbar-${notification.id}`"
                        :vertical="true"
                        attach="true"
                        location="bottom right"
                        @click="notification.visible = false"
                        @update:model-value="data.notifications.splice(idx, 1)"
                    >
                        <div class="d-flex flex-row">
                            <div class="d-flex flex-row align-center">
                                <v-icon v-if="notification.level !== NotificationLevel.Loading" color="white" :icon="getIcon(notification)" class="mr-4" style="font-size: 40px" />
                                <v-progress-circular v-else :size="40" :width="4" class="mr-4" color="white" indeterminate />
                            </div>
                            <div>
                                <div v-if="notification.title" class="text-subtitle-1 pb-2">{{ notification.title }}</div>
                                <div>{{ notification.message }}</div>
                            </div>
                        </div>
                    </v-snackbar>
                </template>
                <component is="style" v-for="(notification, idx) in data.notifications" :key="notification.id + idx">
                    .v-snackbar-{{notification.id}} {
                        bottom: {{ offsets[idx] }}px !important;
                    }
                </component>
            </div>
        </v-locale-provider>
    </v-theme-provider>
</template>

<style lang="sass">
.v-snackbar
    z-index: 2000000003 !important
    transition: bottom .3s ease

    &__content
        font-size: 14.875px !important

        .text-subtitle-1
            font-size: 17px !important
</style>
