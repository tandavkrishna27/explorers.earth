import type { Pool } from "pg";
import { newInvalidPostalCodes, accountDtoSchema, updateAccountRequestSchema, type AccountDto, type RequestContext,
  type RevisionInput, type UpdateAccountInput } from "../../shared/explorersContract";
import { handleViolationsOnSave } from "../../shared/explorersReservedHandles";
import type { Actor } from "./actor";
import { authorizeOperation } from "./authorization";
import { AccountConflict, AccountInvalidAttachment, ExplorersAccountRepository } from "../repositories/explorersAccountRepository";
import { readSampleReceipts } from "../repositories/sampleRepository";
import { countryFromAccount, sampleKeysForSet, SampleSeeder } from "./sampleSeeding";

export class ProfileInputError extends Error { constructor(message: string) { super(message); } }

export class ProfileService {
  private readonly repository: ExplorersAccountRepository;
  private readonly samples: SampleSeeder;
  constructor(private readonly db: Pool) { this.repository = new ExplorersAccountRepository(db); this.samples = new SampleSeeder(db); }

  async getMyProfile(actor: Actor): Promise<AccountDto> {
    await authorizeOperation(this.db, actor, "profile:read", actor.accountId);
    const account = accountDtoSchema.parse(await this.repository.get(actor.accountId));
    await this.resumePendingSamples(account);
    return account;
  }

  async updateAccount(actor: Actor, input: UpdateAccountInput & RevisionInput, _context: RequestContext): Promise<AccountDto> {
    await authorizeOperation(this.db, actor, "profile:write", actor.accountId);
    const parsed = updateAccountRequestSchema.safeParse(input);
    if (!parsed.success) throw new ProfileInputError("Invalid profile fields");
    const normalized = { ...parsed.data };
    if (typeof normalized.handle === "string") {
      normalized.handle = normalized.handle.toLowerCase();
      // Only a changed handle is held to the rules; an existing holder keeps saving (see handleViolationsOnSave).
      const current = (await this.repository.get(actor.accountId)).handle;
      if (handleViolationsOnSave(current, normalized.handle).length > 0) throw new ProfileInputError("Handle is unavailable");
    }
    if (normalized.primaryAddress?.postalCode !== undefined || normalized.additionalAddresses?.some((a) => a.postalCode !== undefined)) {
      const stored = await this.repository.get(actor.accountId);
      if (newInvalidPostalCodes(normalized, stored).length > 0) throw new ProfileInputError("Invalid postal code");
    }
    const { expectedRevision, ...editable } = normalized;
    let updated: AccountDto;
    try { updated = accountDtoSchema.parse(await this.repository.update(actor.accountId, editable, expectedRevision)); }
    catch (error) {
      if (error instanceof AccountConflict) throw error;
      if (error instanceof AccountInvalidAttachment) throw new ProfileInputError("Invalid media attachment");
      if (error instanceof ProfileInputError) throw error;
      if ((error as { code?: string })?.code?.startsWith("23")) throw new ProfileInputError("Invalid profile fields");
      throw error;
    }
    // WP11: onboarding has committed; first-visit samples are seeded after it, never inside it.
    if (editable.onboardingStatus === "complete") await this.seedSamples(updated);
    return updated;
  }

  /** Seeding never fails the caller: onboarding has already committed. Keys left without a receipt are resumed by the next owner read. */
  private async seedSamples(account: AccountDto): Promise<void> {
    if (account.onboardingStatus !== "complete") return;
    try { await this.samples.seedForAccount(account.id, countryFromAccount(account)); }
    catch (error) { console.error("[explorers] sample seeding deferred", { accountId: account.id, code: (error as { code?: string })?.code }); }
  }

  /**
   * Resume only a seed that started: the account has at least one receipt but not one for every key
   * of its fixture set. An account with no receipt is not seeded on read. Receipts are permanent,
   * so a deleted sample still counts as done and is never resumed.
   */
  private async resumePendingSamples(account: AccountDto): Promise<void> {
    const receipts = await readSampleReceipts(this.db, account.id);
    if (!receipts.length) return;
    const done = new Set<string>(receipts.map((r) => r.sampleKey));
    if (sampleKeysForSet(receipts[0]!.fixtureSet).some((k) => !done.has(k))) await this.seedSamples(account);
  }
}

export async function getMyProfile(db: Pool, actor: Actor): Promise<AccountDto> {
  return new ProfileService(db).getMyProfile(actor);
}
export async function updateAccount(db: Pool, actor: Actor, input: UpdateAccountInput & RevisionInput,
  context: RequestContext): Promise<AccountDto> {
  return new ProfileService(db).updateAccount(actor, input, context);
}
