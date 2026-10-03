import { join } from 'node:path';
import { LocalObjectStorage } from '../server/services/objectStorage';

/** Live consent remains on an owned local media root, regardless of ambient defaults. */
export function createLiveGoogleMediaStorage(disposable: string,
  environment: NodeJS.ProcessEnv = process.env): LocalObjectStorage {
  if ((environment.EXPLORERS_MEDIA_ENVIRONMENT && environment.EXPLORERS_MEDIA_ENVIRONMENT !== 'local')
    || environment.EXPLORERS_MEDIA_S3_BUCKET || environment.EXPLORERS_MEDIA_S3_REGION) {
    throw new Error('External media authority is forbidden for local Google trial');
  }
  return new LocalObjectStorage(join(disposable, 'media'));
}
