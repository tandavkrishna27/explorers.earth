import type { Pool } from "pg";
import { accountDtoSchema, updateAccountRequestSchema, type AccountDto, type RequestContext,
  type RevisionInput, type UpdateAccountInput } from "../../shared/explorersContract";
import type { Actor } from "./actor";
import { authorizeOperation } from "./authorization";
import { AccountConflict, AccountInvalidAttachment, ExplorersAccountRepository } from "../repositories/explorersAccountRepository";

export class ProfileInputError extends Error { constructor(message: string) { super(message); } }
const reserved = new Set(["api", "auth", "login", "logout", "signup", "onboarding", "profile", "settings",
  "recommendations", "favorites", "music", "books", "movies", "games", "apps", "products", "people", "places",
  "guides", "claimaccount", "home", "reactivate", "admin", "assets"]);

export class ProfileService {
  private readonly repository: ExplorersAccountRepository;
  constructor(private readonly db: Pool) { this.repository = new ExplorersAccountRepository(db); }

  async getMyProfile(actor: Actor): Promise<AccountDto> {
    await authorizeOperation(this.db, actor, "profile:read", actor.accountId);
    return accountDtoSchema.parse(await this.repository.get(actor.accountId));
  }

  async updateAccount(actor: Actor, input: UpdateAccountInput & RevisionInput, _context: RequestContext): Promise<AccountDto> {
    await authorizeOperation(this.db, actor, "profile:write", actor.accountId);
    const parsed = updateAccountRequestSchema.safeParse(input);
    if (!parsed.success) throw new ProfileInputError("Invalid profile fields");
    const normalized = { ...parsed.data };
    if (typeof normalized.handle === "string") {
      normalized.handle = normalized.handle.toLowerCase();
      if (!/^[a-z][a-z0-9-]{2,29}$/.test(normalized.handle) || normalized.handle.includes("--")
        || normalized.handle.endsWith("-") || reserved.has(normalized.handle)) throw new ProfileInputError("Handle is unavailable");
    }
    const { expectedRevision, ...editable } = normalized;
    try { return accountDtoSchema.parse(await this.repository.update(actor.accountId, editable, expectedRevision)); }
    catch (error) {
      if (error instanceof AccountConflict) throw error;
      if (error instanceof AccountInvalidAttachment) throw new ProfileInputError("Invalid media attachment");
      if (error instanceof ProfileInputError) throw error;
      if ((error as { code?: string })?.code?.startsWith("23")) throw new ProfileInputError("Invalid profile fields");
      throw error;
    }
  }
}

export async function getMyProfile(db: Pool, actor: Actor): Promise<AccountDto> {
  return new ProfileService(db).getMyProfile(actor);
}
export async function updateAccount(db: Pool, actor: Actor, input: UpdateAccountInput & RevisionInput,
  context: RequestContext): Promise<AccountDto> {
  return new ProfileService(db).updateAccount(actor, input, context);
}
