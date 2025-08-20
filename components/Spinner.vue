<script setup lang="ts">
const { size, color } = defineProps({
    size: {
        type: [Number, String],
        default: '1em',
    },
    color: String,
    thickness: {
        type: Number,
        default: 5,
    },
});
const style = computed(() => ({
    color: color || 'currentColor',
}));
</script>

<template>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="25 25 50 50"
        :width="size"
        :height="size"
        :style="style"
        class="vue-spinner vue-spinner-mat"
    >
        <circle
            class="path"
            cx="50"
            cy="50"
            r="20"
            fill="none"
            stroke="currentColor"
            :stroke-width="thickness"
            stroke-miterlimit="10"
        />
    </svg>
</template>

<style scoped lang="css">
@reference "../assets/tailwind.css";

@layer components {
    .vue-spinner-mat {
        animation: vue-spinner-spin 2s linear infinite;
        transform-origin: center center;
    }

    .vue-spinner-mat .path {
        stroke-dasharray: 1, 200;
        stroke-dashoffset: 0;
        animation: vue-spinner-mat-dash 1.5s ease-in-out infinite;
    }

    @keyframes vue-spinner-spin {
        0% {
            transform: rotate3d(0, 0, 1, 0deg);
        }

        100% {
            transform: rotate3d(0, 0, 1, 359deg);
        }
    }

    @keyframes vue-spinner-mat-dash {
        0% {
            stroke-dasharray: 1, 200;
            stroke-dashoffset: 0;
        }

        50% {
            stroke-dasharray: 89, 200;
            stroke-dashoffset: -35px;
        }

        100% {
            stroke-dasharray: 89, 200;
            stroke-dashoffset: -124px;
        }
    }
}
</style>