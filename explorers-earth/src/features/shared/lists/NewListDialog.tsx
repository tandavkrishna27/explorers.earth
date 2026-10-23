import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExplorersApiError } from "../../../lib/explorersApiClient";
import { getCurrentDomain } from "../../../utils/getCurrentDomain";
import AddressInput from "../../Profile/components/AddressInput";
import type { Places } from "../../Profile/types/types";
import { locationSnapshot } from "../../Favorites/hooks/useCreateLocation";
import { createList, type CreateListInput } from "../category/listWrites";
import type { CategoryKey } from "../category/categoryConfig";

export type NewListCreate = (input: CreateListInput, place: Places | null) => Promise<{ id: string }>;

export interface NewListDialogProps {
  open: boolean;
  category: CategoryKey;
  username: string;
  initialName?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Overrides the plain create (Places imports a cover first). */
  create?: NewListCreate;
}

export const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

/** While typing, hyphens survive (a trailing "-" is kept until submit, where slugify tidies it). */
const slugDraft = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]/g, "-");

const cityOf = (place: Places) => {
  for (const type of ["locality", "sublocality", "administrative_area_level_2", "administrative_area_level_3"]) {
    const component = place.address_components?.find((part) => part.types.includes(type));
    if (component) return component.long_name;
  }
  return place.name ?? "";
};

export default function NewListDialog({ open, category, username, initialName = "", onClose, onCreated, create }: NewListDialogProps) {
  const { t } = useTranslation();
  const places = category === "places";
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState(slugify(initialName));
  const [slugEdited, setSlugEdited] = useState(false);
  const [place, setPlace] = useState<Places | null>(null);
  const [errors, setErrors] = useState<{ name?: string; slug?: string; location?: string }>({});
  const [saving, setSaving] = useState(false);
  const nameTouched = useRef(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName); setSlug(slugify(initialName)); setSlugEdited(false); setDescription(""); setPlace(null); setErrors({});
    nameTouched.current = false;
    firstField.current?.focus();
  }, [open, initialName]);

  if (!open) return null;

  const changeName = (value: string) => { nameTouched.current = true; setName(value); if (!slugEdited) setSlug(slugify(value)); };
  const pickPlace = (picked: Places) => {
    setPlace(picked);
    if (!nameTouched.current || !name.trim()) { const city = cityOf(picked); setName(city); if (!slugEdited) setSlug(slugify(city)); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (places && !place?.place_id) next.location = t("dashboard.wp3a.dialog.locationRequired");
    if (!name.trim()) next.name = t("dashboard.wp3a.dialog.nameRequired");
    if (!slugify(slug)) next.slug = t("dashboard.wp3a.dialog.slugRequired");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const location = place?.geometry?.location;
    const input: CreateListInput = {
      category, title: name.trim(), slug: slugify(slug), description: description.trim() || null,
      ...(places && place ? { placeLocation: { locationEntityId: null, instagramMediaUrl: null,
        locationSnapshot: locationSnapshot({ placeId: place.place_id, name: cityOf(place), address: place.formatted_address,
          location: location ? { latitude: location.lat(), longitude: location.lng() } : null }) } } : {}),
    };
    setSaving(true);
    try {
      const created = create ? await create(input, place) : await createList(input);
      toast.success(t("dashboard.wp3a.toasts.listCreated"));
      onCreated(created.id);
    } catch (error) {
      if (error instanceof ExplorersApiError && error.status === 409) setErrors({ slug: t("dashboard.wp3a.dialog.slugTaken") });
      else toast.error(t("dashboard.wp3a.dialog.failed"));
    } finally { setSaving(false); }
  };

  const field = "w-full rounded-lg border border-dashboard-border bg-dashboard-muted px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:border-dashboard-accent focus:outline-none";
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm md:p-6" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={t("dashboard.wp3a.dialog.title")} onSubmit={submit} onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
        className="w-full max-w-2xl space-y-5 rounded-xl border border-dashboard-border bg-dashboard-sidebar p-6 shadow-2xl md:p-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-dashboard">{t("dashboard.wp3a.dialog.title")}</h2>
          <button type="button" onClick={onClose} aria-label={t("dashboard.wp3a.dialog.cancel")} className="rounded-full bg-white/5 p-1.5 text-dashboard-muted">✕</button>
        </div>
        {places && (
          <div className="grid gap-2">
            <span className="text-sm font-semibold text-dashboard">{t("dashboard.wp3a.dialog.location")}</span>
            <AddressInput type="listName" label={t("dashboard.wp3a.dialog.location")} setPlaces={pickPlace} onChange={() => {}} placeHolder={t("dashboard.wp3a.dialog.locationPlaceholder")} />
            {errors.location && <p role="alert" className="text-xs text-red-400">{errors.location}</p>}
          </div>
        )}
        <div className="grid gap-2">
          <label htmlFor="wp3a-name" className="text-sm font-semibold text-dashboard">{t("dashboard.wp3a.dialog.name")}</label>
          <input id="wp3a-name" ref={firstField} value={name} maxLength={500} onChange={(event) => changeName(event.target.value)} placeholder={t("dashboard.wp3a.dialog.namePlaceholder")} className={field} />
          {errors.name && <p role="alert" className="text-xs text-red-400">{errors.name}</p>}
        </div>
        <div className="grid gap-2">
          <label htmlFor="wp3a-description" className="text-sm font-semibold text-dashboard">{t("dashboard.wp3a.dialog.description")}</label>
          <textarea id="wp3a-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className={`${field} resize-none`} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="wp3a-slug" className="text-[11px] font-medium text-dashboard-muted">{t("dashboard.wp3a.dialog.address")}</label>
          <div className="flex items-center gap-1 text-[11px] text-dashboard-muted">
            <span className="shrink-0">{getCurrentDomain()}/{username}/</span>
            <input id="wp3a-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugDraft(event.target.value)); }}
              className="min-w-0 flex-1 rounded-md border border-dashboard-border bg-dashboard-muted px-2 py-1 text-[12px] text-dashboard" />
          </div>
          {errors.slug && <p role="alert" className="text-xs text-red-400">{errors.slug}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-dashboard-border pt-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-gray-200">{t("dashboard.wp3a.dialog.cancel")}</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-[#60a5fa] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">{t("dashboard.wp3a.dialog.create")}</button>
        </div>
      </form>
    </div>
  );
}

/** Keeps the six legacy named exports (imported by pages/Home.tsx) working on top of the shared popup. */
export function createLegacyListModal(category: CategoryKey) {
  return function LegacyCreateListModal(props: { open: boolean; onClose: () => void; onCreated: (newId?: string) => void; username?: string; defaultListName?: string; accountDocumentId?: string; currentListCount?: number }) {
    return <NewListDialog open={props.open} category={category} username={props.username ?? ""} initialName={props.defaultListName}
      onClose={props.onClose} onCreated={(id) => { props.onCreated(id); props.onClose(); }} />;
  };
}
