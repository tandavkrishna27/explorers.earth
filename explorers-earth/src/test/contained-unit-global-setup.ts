import { createRequire } from 'node:module';
import type { TestProject } from 'vitest/node';

type Canary = { host: '127.0.0.1'; port: number; pid: number };
type CanaryHandle = {
  endpoint: Canary;
  close(): Promise<number>;
};
type CleanupOwner = {
  dispose(): Promise<void>;
};

const require = createRequire(import.meta.url);
const { createCleanupOwner, startCanary, assertBlocked } = require('../../scripts/contained-unit-runtime.cjs') as {
  createCleanupOwner(): CleanupOwner;
  startCanary(owner: CleanupOwner): Promise<CanaryHandle>;
  assertBlocked(endpoint: Canary): Promise<'TEST_EGRESS_BLOCKED'>;
};

export default async function setup(project: TestProject) {
  const owner = createCleanupOwner();
  let canary: CanaryHandle;
  try {
    canary = await startCanary(owner);
    const controllerCode = await assertBlocked(canary.endpoint);
    project.provide('containedCanary', {
      endpoint: canary.endpoint,
      controllerPid: process.pid,
      controllerCode,
    });
  } catch (error) {
    await owner.dispose();
    throw error;
  }
  return async () => {
    try {
      if (await canary.close() !== 0) throw new Error('Unowned containment canary received a connection');
    } finally {
      await owner.dispose();
    }
  };
}
