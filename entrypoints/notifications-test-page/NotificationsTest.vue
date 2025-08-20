<script setup lang="ts">
import Notifications from '../notifications.content/Notifications.vue';

const n = ref<InstanceType<typeof Notifications>>();
const message = ref();

const createNotification = async () => {
    if (message.value) {
        await finishNotification(NotificationLevel.Error);
    }
    message.value = await n.value?.pushNotification({
        level: NotificationLevel.Loading,
        title: 'title',
        message: 'message',
    });
    console.log(message.value);
}

const finishNotification = (level: NotificationLevel) => {
    if (message.value) {
        n.value?.updateNotification({
            id: message.value,
            level: level,
            title: 'title',
            message: 'level changed',
        });
        message.value = undefined;
    }
}

const test3 = async () => {
    n.value?.pushNotification({
        level: NotificationLevel.Success,
        title: 'title',
        message: 'message',
    });
    const id = await n.value?.pushNotification({
        level: NotificationLevel.Loading,
        title: 'title2',
        message: 'message',
    });
    n.value?.pushNotification({
        level: NotificationLevel.Success,
        title: 'title3',
        message: 'message',
    });
    setTimeout(() => {
        n.value?.updateNotification({
            id: id,
            level: NotificationLevel.Success,
            title: 'title',
            message: 'level changed',
        });
    }, 500);
}

const test4 = async () => {
    const id1 = await n.value?.pushNotification({
        level: NotificationLevel.Success,
        title: 'title',
        message: 'message',
    });
    n.value?.pushNotification({
        level: NotificationLevel.Loading,
        title: 'title2',
        message: 'message',
    });
    const id2 = await n.value?.pushNotification({
        level: NotificationLevel.Success,
        title: 'title3',
        message: 'message',
    });
    setTimeout(() => {
        n.value?.updateNotification({
            id: id1,
            level: NotificationLevel.Success,
            title: 'title',
            message: 'level changed',
        });
        n.value?.updateNotification({
            id: id2,
            level: NotificationLevel.Success,
            title: 'title',
            message: 'level changed',
        });
    }, 500);
}
</script>

<template>
    <notifications ref="n" />
    <button class="btn mr-2" @click="createNotification()">create</button>
    <button class="btn mr-2" @click="finishNotification(NotificationLevel.Success)">success</button>
    <button class="btn mr-2" @click="finishNotification(NotificationLevel.Error)">error</button>
    <button class="btn mr-2" @click="test3">Test3</button>
    <button class="btn mr-2" @click="test4">Test4</button>
</template>

<style lang="css">
@reference "../../assets/tailwind.css";

@layer components {
  .btn {
    @apply
      p-2
      bg-background
      text-gray-50
      rounded-sm;
  }
}
</style>
