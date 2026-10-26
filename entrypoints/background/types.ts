export type PortMessage =
    | {
          type: 'removeTask';
          id: string;
      }
    | {
          type: 'retryTask';
          id: string;
      };

export type ExternalMessage =
    | {
          type: 'updateContextMenu' | 'getUploadLinks';
      }
    | ({
          type: 'upload';
          /** Destination API key, sent as the `x-key` header. */
          apiKey: string;
      } & (
          | {
                method: 'photoBase64';
                /**
                 * Base64 payload, with or without the `data:` prefix.
                 * Raw payloads are assumed to be `image/jpeg`.
                 */
                data: string;
            }
          | {
                method: 'photoArrayBuffer';
                /** Raw image bytes. Structured-clones across message passing. */
                data: ArrayBuffer;
                /** MIME type of `data`. Defaults to `image/jpeg`. */
                mimeType?: string;
            }
          | {
                method: 'photoUrl';
                url: string;
            }
          | {
                method: 'gif';
                url: string;
            }
      ))
    | {
          type: 'notification';
          options: NotificationOptions;
      }
    | {
          type: 'update-notification';
          options: UpdateNotificationOptions;
      }
    | {
          type: 'remove-notification';
          options: RemoveNotificationOptions;
      };

export type UploadTask = {
    id: string;
    /** Destination API key, sent as the `x-key` header. */
    apiKey: string;
    /** Server-side task id from a completed upload (for `/delete`). */
    uploadId?: string;
    retries: number;
    status: 'queued' | 'processing' | 'complete' | 'duplicate' | 'failed';
} & (
    | {
          type: 'photoFile';
      }
    | {
          type: 'photoUrl';
          url: string;
      }
    | {
          type: 'gif';
          url: string;
      }
);

export type UploadResponse =
    | {
          status: 'ok';
          hash?: string;
          upload_id: string;
      }
    | {
          status: 'duplicate';
          hash: string;
      }
    | {
          status: 'error';
          message: string;
      };
