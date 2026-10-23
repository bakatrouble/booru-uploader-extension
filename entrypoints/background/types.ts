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
          endpoint: string;
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
      ));

export type UploadTask = {
    id: string;
    endpoint: string;
    retries: number;
    status: 'queued' | 'processing' | 'complete' | 'duplicate' | 'failed';
} & (
    | {
          type: 'photoFile';
          file?: string;
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
