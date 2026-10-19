import type { Pool, PoolClient } from "pg";
import { categoryKeys, HANDLE_CHANGE_COOLDOWN_DAYS, type AccountDto, type UpdateAccountInput } from "../../shared/explorersContract";

const columns: Record<string, string> = {
  handle: "handle", displayName: "display_name", accountType: "account_type", onboardingStatus: "onboarding_status",
  publicProfile: "public_profile", autoPinning: "auto_pinning", locale: "locale", mobileNumber: "mobile_number",
  mobileNumberVisible: "mobile_number_visible", bioPlain: "bio_plain", bioRich: "bio_rich",
  primaryAddress: "primary_address", additionalAddresses: "additional_addresses", publicAddress: "public_address",
  profilePlaceDetails: "profile_place_details",
};
const jsonFields = new Set(["bioRich", "primaryAddress", "additionalAddresses", "publicAddress", "profilePlaceDetails"]);

const categoriesWithRetiredMusic = [...categoryKeys, "music"] as const;
const knownCategories = new Set<string>(categoryKeys);

/**
 * The category set, or that set plus the music category retired by 0057: a tab still
 * holding a snapshot read before the migration echoes its music row, and that save must
 * succeed. The music entry itself is never written (see update()).
 */
export function isAcceptedCategorySet(supplied: readonly string[]): boolean {
  const unique = new Set(supplied);
  if (unique.size !== supplied.length) return false;
  return [categoryKeys, categoriesWithRetiredMusic].some((accepted) =>
    accepted.length === supplied.length && accepted.every((category) => unique.has(category)));
}

/**
 * Defensive read: a category row or categoryOrder entry the 0057 migration missed must
 * degrade, not take the account down - the owner read parses this through
 * accountDtoSchema, and an unknown category there is a ZodError and a 503 for that owner.
 */
function knownThemeSettings(themeSettings: unknown): unknown {
  if (!themeSettings || typeof themeSettings !== "object" || Array.isArray(themeSettings)) return themeSettings;
  const settings = themeSettings as { recommendations?: unknown };
  const recommendations = settings.recommendations as { categoryOrder?: unknown } | undefined;
  if (!recommendations || typeof recommendations !== "object" || !Array.isArray(recommendations.categoryOrder)) return themeSettings;
  return { ...settings, recommendations: { ...recommendations,
    categoryOrder: recommendations.categoryOrder.filter((category) => typeof category === "string" && knownCategories.has(category)) } };
}

export class AccountConflict extends Error {
  /** `handle_cooldown` carries `nextAllowedAt`: the handle was changed too recently. */
  constructor(readonly kind: "revision" | "handle" | "handle_cooldown", readonly nextAllowedAt?: Date) { super(kind); }
}
export class AccountInvalidAttachment extends Error {}

export class ExplorersAccountRepository {
  constructor(private readonly db: Pool) {}

  async get(accountId: string, query: Pick<Pool | PoolClient, "query"> = this.db): Promise<AccountDto> {
    const account = await query.query("SELECT * FROM creator_accounts WHERE id=$1", [accountId]);
    const settings = await query.query("SELECT category,is_public,display_order,pinned_order FROM account_category_settings WHERE account_id=$1 ORDER BY display_order", [accountId]);
    const presentation = await query.query("SELECT theme_settings,social_links,business_details FROM account_presentation WHERE account_id=$1", [accountId]);
    const media = await query.query(`SELECT pm.slot,m.id,m.mime_type,m.byte_size,m.alternative_text,m.caption
        FROM profile_media pm JOIN media_assets m ON m.id=pm.media_id AND m.account_id=pm.account_id
        WHERE pm.account_id=$1 AND m.status='ready'`, [accountId]);
    const feed = await query.query(`SELECT id,media_id,external_url,source,media_type,caption,details
      FROM profile_feed_items WHERE account_id=$1 ORDER BY display_order`, [accountId]);
    // The row written when the handle last changed says when it may change again.
    const lastChange = await query.query<{ allowed_at: Date | null }>(
      `SELECT max(created_at)+make_interval(days=>$2) AS allowed_at FROM account_handle_holds WHERE account_id=$1`,
      [accountId, HANDLE_CHANGE_COOLDOWN_DAYS]);
    const row = account.rows[0];
    if (!row) throw new Error("Account disappeared");
    const allowedAt = lastChange.rows[0]?.allowed_at;
    const p = presentation.rows[0] ?? { theme_settings: {}, social_links: [], business_details: {} };
    const mediaDto = (slot: string) => {
      const asset = media.rows.find((value) => value.slot === slot);
      return asset ? { id: asset.id, url: `/api/explorers/v1/media/${asset.id}/content`, mimeType: asset.mime_type,
        size: Number(asset.byte_size), alternativeText: asset.alternative_text, caption: asset.caption } : undefined;
    };
    return { id: row.id, handle: row.handle, displayName: row.display_name, accountType: row.account_type,
      onboardingStatus: row.onboarding_status, status: row.status, revision: Number(row.revision),
      handleChangeAllowedAt: allowedAt && allowedAt.getTime() > Date.now() ? allowedAt.toISOString() : null,
      publicProfile: row.public_profile, autoPinning: row.auto_pinning, locale: row.locale,
      mobileNumber: row.mobile_number, mobileNumberVisible: row.mobile_number_visible,
      bioPlain: row.bio_plain, bioRich: row.bio_rich, primaryAddress: row.primary_address,
      additionalAddresses: row.additional_addresses, publicAddress: row.public_address,
      profilePlaceDetails: row.profile_place_details,
      categories: settings.rows.filter((value) => knownCategories.has(value.category))
        .map((value) => ({ category: value.category, isPublic: value.is_public,
          displayOrder: value.display_order, pinnedOrder: value.pinned_order })),
      themeSettings: knownThemeSettings(p.theme_settings) as AccountDto["themeSettings"], socialLinks: p.social_links, businessDetails: p.business_details,
      profileImage: mediaDto("profile"), backgroundImage: mediaDto("background"),
      feedItems: feed.rows.map((item) => ({ id: item.id, mediaId: item.media_id,
        url: item.media_id ? `/api/explorers/v1/media/${item.media_id}/content` : item.external_url,
        source: item.source, type: item.media_type, caption: item.caption, details: item.details })) } as AccountDto;
  }

  /**
   * A handle change is refused while the account's last change is inside the cooldown, and
   * while another account holds the handle it wants. Both checks run under advisory locks on
   * the two handle keys, taken in key order, so a change away from a handle and a claim of it
   * cannot both pass: the claimer waits for the change to commit and then sees its hold.
   */
  private async beginHandleChange(client: PoolClient, accountId: string, from: string | null, to: string): Promise<void> {
    for (const key of [from, to].filter((value): value is string => value !== null).sort())
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`explorers-handle:${key}`]);
    const held = await client.query<{ account_id: string }>(
      "SELECT account_id FROM account_handle_holds WHERE handle_key=$1 AND held_until>now()", [to]);
    if (held.rows[0] && held.rows[0].account_id !== accountId) throw new AccountConflict("handle");
    // Claiming a first handle is not a change, so it has no cooldown.
    if (from === null) return;
    const last = await client.query<{ allowed_at: Date | null; blocked: boolean | null }>(
      `SELECT max(created_at)+make_interval(days=>$2) AS allowed_at,
         max(created_at)+make_interval(days=>$2)>now() AS blocked FROM account_handle_holds WHERE account_id=$1`,
      [accountId, HANDLE_CHANGE_COOLDOWN_DAYS]);
    if (last.rows[0]?.blocked && last.rows[0].allowed_at) throw new AccountConflict("handle_cooldown", last.rows[0].allowed_at);
  }

  /** The handle just left is held for the cooldown, and one the account is taking back is released. */
  private async recordHandleChange(client: PoolClient, accountId: string, from: string | null, to: string): Promise<void> {
    await client.query("DELETE FROM account_handle_holds WHERE handle_key=$1 AND account_id=$2", [to, accountId]);
    if (from === null) return;
    await client.query(`INSERT INTO account_handle_holds(handle_key,account_id,held_until,created_at)
      VALUES ($1,$2,now()+make_interval(days=>$3),now())
      ON CONFLICT(handle_key) DO UPDATE SET account_id=EXCLUDED.account_id,held_until=EXCLUDED.held_until,created_at=EXCLUDED.created_at`,
      [from, accountId, HANDLE_CHANGE_COOLDOWN_DAYS]);
  }

  async update(accountId: string, input: UpdateAccountInput, expectedRevision: number): Promise<AccountDto> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ revision: string; handle: string | null }>("SELECT revision::text,handle FROM creator_accounts WHERE id=$1 FOR UPDATE", [accountId]);
      if (!current.rows[0] || Number(current.rows[0].revision) !== expectedRevision) throw new AccountConflict("revision");
      // Taken before the update so a refused handle changes nothing else in this save.
      const handleChange = typeof input.handle === "string" && input.handle.toLowerCase() !== (current.rows[0].handle ?? "").toLowerCase()
        ? { from: current.rows[0].handle?.toLowerCase() ?? null, to: input.handle.toLowerCase() } : undefined;
      if (handleChange) await this.beginHandleChange(client, accountId, handleChange.from, handleChange.to);
      const entries = Object.entries(input).filter(([key, value]) => key in columns && value !== undefined);
      if (entries.length) {
        const clauses = entries.map(([key], index) => `${columns[key]}=$${index + 2}`);
        const values = entries.map(([key, value]) => jsonFields.has(key) && value !== null ? JSON.stringify(value) : value);
        await client.query(`UPDATE creator_accounts SET ${clauses.join(",")},updated_at=now() WHERE id=$1`, [accountId, ...values]);
      }
      if (input.categories) {
        if (!isAcceptedCategorySet(input.categories.map((item) => item.category))) throw new Error("Invalid category set");
        // The music category is being retired (P3). A client may echo the nine rows it
        // read before the retirement migration or the eight it reads after it, so both
        // sets are accepted and music is never written. A music row that still exists is
        // parked after every supplied row, unpinned, so the deferred unique constraints on
        // display and pinned order cannot collide with the supplied ordering.
        const written = input.categories.filter((item) => item.category !== "music");
        for (const item of written) await client.query(`UPDATE account_category_settings
          SET is_public=$3,display_order=$4,pinned_order=$5 WHERE account_id=$1 AND category=$2`,
          [accountId, item.category, item.isPublic, item.displayOrder, item.pinnedOrder]);
        await client.query(`UPDATE account_category_settings SET display_order=$2,pinned_order=NULL
          WHERE account_id=$1 AND category='music'`,
          [accountId, Math.max(-1, ...written.map((item) => item.displayOrder)) + 1]);
      }
      if (handleChange) await this.recordHandleChange(client, accountId, handleChange.from, handleChange.to);
      const p: Array<[string, unknown]> = [];
      if (input.themeSettings !== undefined) p.push(["theme_settings", input.themeSettings]);
      if (input.socialLinks !== undefined) p.push(["social_links", input.socialLinks]);
      if (input.businessDetails !== undefined) p.push(["business_details", input.businessDetails]);
      if (input.themeSettings?.wallpaperUrl) {
        const wallpaperId = input.themeSettings.wallpaperUrl.match(/\/media\/([0-9a-f-]{36})\/content$/i)?.[1];
        const wallpaper = await client.query(`SELECT 1 FROM profile_media pm JOIN media_assets m
          ON m.id=pm.media_id AND m.account_id=pm.account_id AND m.status='ready'
          WHERE pm.account_id=$1 AND pm.slot='wallpaper' AND pm.media_id=$2`, [accountId, wallpaperId]);
        if (!wallpaper.rows[0]) throw new AccountInvalidAttachment("Wallpaper must be an attached owned asset");
      }
      if (p.length) await client.query(`UPDATE account_presentation SET ${p.map(([key], i) => `${key}=$${i + 2}`).join(",")}
        WHERE account_id=$1`, [accountId, ...p.map(([, value]) => JSON.stringify(value))]);
      for (const [field, slot] of [["profileImageId", "profile"], ["backgroundImageId", "background"]] as const) {
        if (input[field] === undefined) continue;
        if (input[field] === null) await client.query("DELETE FROM profile_media WHERE account_id=$1 AND slot=$2", [accountId, slot]);
        else {
          const asset = await client.query(`SELECT id FROM media_assets WHERE id=$1 AND account_id=$2
            AND status='ready' AND purpose=$3 FOR SHARE`, [input[field], accountId, slot]);
          if (!asset.rows[0]) throw new AccountInvalidAttachment("Invalid media attachment");
          await client.query(`INSERT INTO profile_media(account_id,slot,media_id) VALUES ($1,$2,$3)
            ON CONFLICT(account_id,slot) DO UPDATE SET media_id=EXCLUDED.media_id,created_at=now()`, [accountId, slot, input[field]]);
        }
      }
      if (input.feedItems !== undefined) {
        await client.query("DELETE FROM profile_feed_items WHERE account_id=$1", [accountId]);
        for (let position = 0; position < input.feedItems.length; position++) {
          const item = input.feedItems[position]!;
          if ((item.mediaId === null) === (item.externalUrl === null) || (item.source === "manual" && item.mediaId === null))
            throw new AccountInvalidAttachment("Invalid feed source");
          if (item.mediaId) {
            const asset = await client.query(`SELECT id FROM media_assets WHERE id=$1 AND account_id=$2
              AND status='ready' AND purpose='feed' FOR SHARE`, [item.mediaId, accountId]);
            if (!asset.rows[0]) throw new AccountInvalidAttachment("Invalid feed media");
          }
          await client.query(`INSERT INTO profile_feed_items(account_id,media_id,external_url,source,media_type,caption,display_order,details)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [accountId, item.mediaId, item.externalUrl, item.source,
            item.type, item.caption, position, JSON.stringify(item.details)]);
        }
      }
      await client.query("UPDATE creator_accounts SET revision=revision+1,updated_at=now() WHERE id=$1", [accountId]);
      const updated = await this.get(accountId, client);
      await client.query("COMMIT");
      return updated;
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505" && error?.constraint === "creator_accounts_handle_key_uq") throw new AccountConflict("handle");
      throw error;
    } finally { client.release(); }
  }
}
