import { SubscriptionsFetcher } from './subscriptionsFetcher';
import { Uploader } from './uploader';

// noinspection JSUnusedGlobalSymbols
export default defineBackground({
    main: () => {
        new Uploader();
        new SubscriptionsFetcher();
    },
});
