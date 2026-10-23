import testImageUrl from './test-image.jpg?url&no-inline';

// Test picture for the dev-only "test" button in the popup. Kept as a
// binary file (emitted as-is) instead of an inline base64 string, and
// uploaded as raw bytes via `photoArrayBuffer`.
export const TEST_IMAGE_MIME = 'image/jpeg';

export const loadTestImage = async (): Promise<{
    buffer: ArrayBuffer;
    mimeType: string;
}> => {
    const response = await fetch(testImageUrl);
    if (!response.ok) {
        throw new Error(
            `Failed to load test image: ${response.status} ${response.statusText}`,
        );
    }
    return { buffer: await response.arrayBuffer(), mimeType: TEST_IMAGE_MIME };
};
