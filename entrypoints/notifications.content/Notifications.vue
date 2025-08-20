<script setup lang="ts">
import { uuidv4 } from 'uuidv7';
import { NotificationLevel } from '@/utils/enums';
import Spinner from '../../components/Spinner.vue';

const notifications = ref<NotificationEntry[]>([]);

const NOTIFICATION_DURATION = 5000;

const planNotificationRemoval = (id: string) => {
    setTimeout(() => {
        notifications.value = notifications.value.filter((item) => item.id !== id)
    }, NOTIFICATION_DURATION);
}

const pushNotification = async (options: NotificationOptions) => {
    const id = uuidv4();
    notifications.value.push({
        ...options,
        visible: true,
        id,
    });
    if (options.level !== NotificationLevel.Loading) {
        planNotificationRemoval(id);
    }
    return id;
}

const updateNotification = async (options: UpdateNotificationOptions) => {
    const idx = notifications.value.findIndex(n => n.id === options.id);
    if (idx !== -1) {
        notifications.value[idx].level = options.level;
        notifications.value[idx].message = options.message;
        notifications.value[idx].title = options.title;
        if (options.level !== NotificationLevel.Loading) {
            planNotificationRemoval(options.id);
        }
    }
}

const messageHandler = (message: RuntimeMessage) => {
    if (message.type === 'notification') {
        return pushNotification(message.options);
    } else if (message.type === 'update-notification') {
        return updateNotification(message.options);
    }
}

onMounted(() => {
    browser?.runtime.onMessage.addListener(messageHandler);
});

defineExpose({
    pushNotification,
    updateNotification,
});
</script>

<template>
    <button>hello</button>
    <transition-group
        tag="div"
        name="list"
        class="notifications-container group"
        :duration="300"
    >
        <div v-for="notification in notifications" :key="notification.id"
            class="notification"
            :data-color="notification.level"
        >
            <div class="flex flex-row">
                <div class="flex flex-row items-center mr-2 text-3xl">
                    <mdicon
                        v-if="notification.level === NotificationLevel.Success"
                        name="checkBold"
                        size="30"
                    />
                    <mdicon
                        v-else-if="notification.level === NotificationLevel.Error"
                        name="alertCircleOutline"
                        size="30"
                    />
                    <spinner v-else-if="notification.level === NotificationLevel.Loading" />
                </div>
                <div class="flex flex-col justify-center">
                    <div v-if="notification.title" class="font-bold mb/2">{{ notification.title }}</div>
                    <div>{{ notification.message }}</div>
                </div>
            </div>
        </div>
    </transition-group>
</template>

<style lang="css">
@layer theme, base, components, utitlities;
@reference "../../assets/tailwind.css";

@layer components {
    .notifications-container {
        @apply
            z-(--base-z-index)
            fixed
            right-4
            bottom-4
            transition-all;
    }

    .notification {
        @apply
            p-2
            rounded-default
            bg-background
            transition-all
            mt-2
            text-gray-50
            font-sans
            leading-tight
            text-sm
            w-48
            group-hover:opacity-30
            group-hover:blur-xs
            pointer-events-none
            data-[color="success"]:bg-green-800
            data-[color="error"]:bg-red-800
            data-[color="loading"]:bg-gray-800;

        &:not(.list-move) {
            z-index: 1;
        }

        &.list-enter-from, &.list-leave-to {
            opacity: 0;
            transform: translateY(50%);
        }

        &.list-leave-active {
            position: absolute;
        }
    }
}
</style>
