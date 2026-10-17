import { createRequire } from 'node:module';
import { inject } from 'vitest';

export type ContainedCanaryContext = {
  endpoint: { host: '127.0.0.1'; port: number; pid: number };
  controllerPid: number;
  controllerCode: 'TEST_EGRESS_BLOCKED';
};

declare module 'vitest' {
  export interface ProvidedContext {
    containedCanary: ContainedCanaryContext;
  }
}

const require = createRequire(import.meta.url);
const { assertBlocked } = require('../../scripts/contained-unit-runtime.cjs') as {
  assertBlocked(endpoint: ContainedCanaryContext['endpoint']): Promise<'TEST_EGRESS_BLOCKED'>;
};

const containedCanary = inject('containedCanary');
if (containedCanary.controllerPid === process.pid) {
  throw new Error('Contained Vitest worker must differ from its controller');
}
if (containedCanary.controllerCode !== 'TEST_EGRESS_BLOCKED') {
  throw new Error('Contained Vitest controller check is missing');
}
if (await assertBlocked(containedCanary.endpoint) !== 'TEST_EGRESS_BLOCKED') {
  throw new Error('Contained Vitest worker check is missing');
}
