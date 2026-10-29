/**
 * In-memory AsyncStorage backend for the app-save-path test.
 *
 * The app's storage adapter imports the React Native AsyncStorage package at
 * module scope. Jest maps that package to this file so the adapter can be
 * exercised in Node without a device or native module. The implementation is
 * deliberately limited to the methods `SaveStore` needs.
 */

const values = new Map<string, string>();

const AsyncStorageMock = {
  async getItem(key: string): Promise<string | null> {
    return values.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    values.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    values.delete(key);
  },
};

/** Clear the backing map between tests. */
export function resetAsyncStorageMock(): void {
  values.clear();
}

/** Read a raw stored value for assertions or old-save simulation. */
export function readStoredValue(key: string): string | null {
  return values.get(key) ?? null;
}

/** Write a raw stored value for assertions or old-save simulation. */
export function writeStoredValue(key: string, value: string): void {
  values.set(key, value);
}

export default AsyncStorageMock;
