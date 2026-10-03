import type { Pool, PoolClient } from "pg";
import { categoryKeys, type AccountDto, type UpdateAccountInput } from "../../shared/explorersContract";

const columns: Record<string, string> = {
  handle: "handle", displayName: "display_name", accountType: "account_type", onboardingStatus: "onboarding_status",
  publicProfile: "public_profile", autoPinning: "auto_pinning", locale: "locale", mobileNumber: "mobile_number",
  mobileNumberVisible: "mobile_number_visible", bioPlain: "bio_plain", bioRich: "bio_rich",
  primaryAddress: "primary_address", additionalAddresses: "additional_addresses", publicAddress: "public_address",
  profilePlaceDetails: "profile_place_details",
};
const jsonFields = new Set(["bioRich", "primaryAddress", "additionalAddresses", "publicAddress", "profilePlaceDetails"]);

export class AccountConflict extends Error {
  constructor(readonly kind: "revision" | "handle") { super(kind); }
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
    const row = account.rows[0];
    if (!row) throw new Error("Account disappeared");
    const p = presentation.rows[0] ?? { theme_settings: {}, social_links: [], business_details: {} };
    const mediaDto = (slot: string) => {
      const asset = media.rows.find((value) => value.slot === slot);
      return asset ? { id: asset.id, url: `/api/explorers/v1/media/${asset.id}/content`, mimeType: asset.mime_type,
        size: Number(asset.byte_size), alternativeText: asset.alternative_text, caption: asset.caption } : undefined;
    };
    return { id: row.id, handle: row.handle, displayName: row.display_name, accountType: row.account_type,
      onboardingStatus: row.onboarding_status, status: row.status, revision: Number(row.revision),
      publicProfile: row.public_profile, autoPinning: row.auto_pinning, locale: row.locale,
      mobileNumber: row.mobile_number, mobileNumberVisible: row.mobile_number_visible,
      bioPlain: row.bio_plain, bioRich: row.bio_rich, primaryAddress: row.primary_address,
      additionalAddresses: row.additional_addresses, publicAddress: row.public_address,
      profilePlaceDetails: row.profile_place_details,
      categories: settings.rows.map((value) => ({ category: value.category, isPublic: value.is_public,
        displayOrder: value.display_order, pinnedOrder: value.pinned_order })),
      themeSettings: p.theme_settings, socialLinks: p.social_links, businessDetails: p.business_details,
      profileImage: mediaDto("profile"), backgroundImage: mediaDto("background"),
      feedItems: feed.rows.map((item) => ({ id: item.id, mediaId: item.media_id,
        url: item.media_id ? `/api/explorers/v1/media/${item.media_id}/content` : item.external_url,
        source: item.source, type: item.media_type, caption: item.caption, details: item.details })) } as AccountDto;
  }

  async update(accountId: string, input: UpdateAccountInput, expectedRevision: number): Promise<AccountDto> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ revision: string }>("SELECT revision::text FROM creator_accounts WHERE id=$1 FOR UPDATE", [accountId]);
      if (!current.rows[0] || Number(current.rows[0].revision) !== expectedRevision) throw new AccountConflict("revision");
      const entries = Object.entries(input).filter(([key, value]) => key in columns && value !== undefined);
      if (entries.length) {
        const clauses = entries.map(([key], index) => `${columns[key]}=$${index + 2}`);
        const values = entries.map(([key, value]) => jsonFields.has(key) && value !== null ? JSON.stringify(value) : value);
        await client.query(`UPDATE creator_accounts SET ${clauses.join(",")},updated_at=now() WHERE id=$1`, [accountId, ...values]);
      }
      if (input.categories) {
        if (input.categories.length !== categoryKeys.length || new Set(input.categories.map((item) => item.category)).size !== categoryKeys.length
          || !categoryKeys.every((category) => input.categories?.some((item) => item.category === category))) throw new Error("Invalid category set");
        for (const item of input.categories) await client.query(`UPDATE account_category_settings
          SET is_public=$3,display_order=$4,pinned_order=$5 WHERE account_id=$1 AND category=$2`,
          [accountId, item.category, item.isPublic, item.displayOrder, item.pinnedOrder]);
      }
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
