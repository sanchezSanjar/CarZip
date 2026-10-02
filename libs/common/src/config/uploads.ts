import { resolve } from 'path';

/**
 * Where uploaded images live on the local disk: ./uploads of the folder the app is started from.
 * The API writes and serves them (LocalStorageService), the batch server deletes the unused ones.
 * Both must be started from the project root, so they see the same folder.
 */
export const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');
