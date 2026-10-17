import { createAccountLifecycleService } from "./accountLifecycleService";

type LifecycleService = ReturnType<typeof createAccountLifecycleService>;

/** Configuration failures reject operations, never unrelated Settings rendering. */
export function createLazyAccountLifecycleService(
  input: Parameters<typeof createAccountLifecycleService>[0],
): LifecycleService {
  let client: LifecycleService | undefined;
  const getClient = () => client ??= createAccountLifecycleService(input);
  return {
    async prepare() { return getClient().prepare(); },
    async status() { return getClient().status(); },
    async markBoundary() { return getClient().markBoundary(); },
    async cancel() { return getClient().cancel(); },
    async suspend() { return getClient().suspend(); },
    async resume() { return getClient().resume(); },
    async deleteAccount(dependencies) { return getClient().deleteAccount(dependencies); },
  };
}
