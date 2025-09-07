import { Uploader } from './uploader';
import { SubscriptionsFetcher } from './subscriptionsFetcher';

// noinspection JSUnusedGlobalSymbols
export default defineBackground({
    main: () => {
        new Uploader();
        new SubscriptionsFetcher();
    }
});
