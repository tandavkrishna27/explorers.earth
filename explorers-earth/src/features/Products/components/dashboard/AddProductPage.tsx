import ReorderableMediaStrip from '../../../../components/reorder/ReorderableMediaStrip';
import { useEffect, useRef, useState } from 'react';
import { friendlyErrorMessage, urlFieldError } from "../../../../utils/friendlyError";
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Upload, X } from 'lucide-react';
import { uploadButton } from '../../../shared/addItem/formStyles';
import { moveItem } from '../../../../components/reorder/moveItem';
import { useMoveAnnouncer } from '../../../../components/reorder/useMoveAnnouncer';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation } from '../../../../lib/explorersApiClient';
import { ProductsClient, type ManualProductIntent } from '../../api/productsClient';
import { useProductsCommands } from '../../api/query';
import { invalidateProducts, useProductsOwner } from '../../hooks/useProductsOwner';
import { PRODUCT_SPEC_WRITE_LIMIT, productAmountSchema, whereToBuy } from '../../../../../../tunes/shared/explorersProductContract';
import type { LinkPreview } from '../../../../../../tunes/shared/explorersLinkPreviewContract';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';
import { useOriginBack } from "../../../../lib/navigation/useOriginBack";
import { listPath } from "../../../../lib/navigation/categoryRoutes";
import AddItemPage from '../../../shared/addItem/AddItemPage';
import StarRating from '../../../../components/StarRating';
import PasteLinkField from '../../../../components/PasteLinkField';
import CurrencyPriceInput from '../../../../components/CurrencyPriceInput';
import { linkPreviewClient } from '../../../../lib/linkPreviewClient';
import { precisionMessage } from '../../../../lib/money';
import TaxonomyCombobox from '../../../../components/TaxonomyCombobox';
import { useCuratedCatalog } from '../../../../lib/curatedTaxonomy';

/**
 * Products add/edit page on the shared add-item template (WP8, DS-03..06, DS-14).
 *
 * One link. The owner pastes where to buy the product; a new product stores that URL both as
 * the shared entity identity (productUrl, NOT NULL) and as the owner's buy link. Editing an
 * existing product never changes its identity: the field then edits the buy link only, and an
 * old row that only ever had a productUrl shows it here (whereToBuy).
 *
 * The pasted link is read once and fills only fields that are still empty, each marked
 * "Filled from link" until the owner changes it. The link's photo is copied into owned media
 * only when the owner asks ("Use this photo") and becomes the lead photo. The logo URL field
 * is gone: the photo is the product's image, so logoUrl is saved as null.
 *
 * Price is exact decimal text with its currency inline; an empty amount is unknown, never
 * zero, and drops the currency. At most eight key facts are written; older rows may hold
 * more and keep them readable, but cannot add another until they are under the cap.
 */
type Field = 'title' | 'brand' | 'price' | 'description';

export default function AddProductPage() {
 const { listId, productId } = useParams<{ listId: string; productId?: string }>();
 const location = useLocation();
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, productId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = useProductsOwner(undefined, true), commands = useProductsCommands();
 const { t } = useTranslation();
 const back = useOriginBack({ to: listPath("products", listId!), label: t("dashboard.wp1.back.list") });
 const backText = back.source === "state" && back.label ? t("dashboard.wp1.back.to", { name: back.label }) : t("dashboard.wp1.back.list");
 const locale = (typeof navigator !== 'undefined' && navigator.language) || undefined;

 const [existingId, setExistingId] = useState('');
 const existingProducts = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_products) ?? []).filter(product => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_products.some(member => member.documentId === product.documentId)).map(product => [product.documentId, product])).values()];

 const [title, setTitle] = useState(''), [link, setLink] = useState('');
 const [brand, setBrand] = useState(''), [description, setDescription] = useState('');
 const [affiliateDisclosed, setAffiliateDisclosed] = useState(false);
 const [price, setPrice] = useState(''), [currency, setCurrency] = useState<string | null>(null);
 const [specifications, setSpecifications] = useState<{ key: string; value: string }[]>([]);
 const [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [filled, setFilled] = useState<Set<Field>>(new Set());
 // Curated category (WP7). The editable read does not carry the stored term, so an edit sends
 // one only when the owner picks it; otherwise the stored assignment is left alone.
 const catalog = useCuratedCatalog('products');
 const [curatedTermId, setCuratedTermId] = useState<string | null>(null), [curatedTouched, setCuratedTouched] = useState(false);
 const [linkImage, setLinkImage] = useState<string | null>(null), [importing, setImporting] = useState(false);
 const [saving, setSaving] = useState(false), [error, setError] = useState('');
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const intent = useRef<{ scope: string; signature: string; value: ManualProductIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);
 // Key fact order is the order they are shown on the public product page.
 const { announce: announceSpec, region: specRegion } = useMoveAnnouncer();
 const moveSpecification = (index: number, delta: -1 | 1) => { setSpecifications(value => moveItem(value, index, index + delta)); announceSpec(`Key fact ${index + 1}`, index + delta + 1, specifications.length); };

 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setTitle(''); setLink(''); setBrand(''); setDescription(''); setAffiliateDisclosed(false); setPrice(''); setCurrency(null); setSpecifications([]); setNote(''); setRating(null); setMedia([]); setPending(0); setFilled(new Set()); setCuratedTermId(null); setCuratedTouched(false); setLinkImage(null); setImporting(false); setSaving(false); setError(''); setExistingId(''); }, [scope]);

 useEffect(() => {
  if (!productId || !owner.content || initialized.current === scope) return;
  const product = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_products.find(row => row.documentId === productId);
  const observed = owner.content.details.get(productId);
  if (!product || !observed) return;
  initialized.current = scope; draftObservation.current = observed;
  // The exact decimal is read back from the observation, not from the display number.
  const offer = observed.detail.category === 'products' ? observed.detail.productOffer : undefined;
  setTitle(product.title); setBrand(product.brand ?? ''); setDescription(product.description ?? '');
  setLink(whereToBuy({ buyUrl: offer?.buyUrl ?? product.buy_url ?? null }, { productUrl: product.product_url }));
  setPrice(offer?.price ?? ''); setCurrency(offer?.currencyCode ?? null); setAffiliateDisclosed(offer?.affiliateDisclosed ?? false);
  setSpecifications(product.specification_list ? product.specification_list.map(entry => ({ ...entry })) : Object.entries(product.specifications ?? {}).map(([key, value]) => ({ key, value })));
  setNote(typeof product.user_recommendation_note === 'string' ? product.user_recommendation_note : '');
  setRating(product.user_rating);
  // Without this the form starts empty and save() sends mediaIds: [], detaching every photo.
  setMedia((observed.detail.mediaIds ?? []).map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
 }, [owner.content, scope, productId, listId]);

 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('Product owner or route changed'); };
 const blank = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };
 const touched = (field: Field) => setFilled(value => { if (!value.has(field)) return value; const next = new Set(value); next.delete(field); return next; });

 // Reported before any command is dispatched. Precision is reported by the price field itself.
 const priceProblem = (() => {
  const trimmed = price.trim();
  if (trimmed === '') return undefined;
  if (!productAmountSchema.safeParse(trimmed).success) return { message: t('currency.invalidAmount'), shown: false };
  if (!currency) return { message: t('currency.needsCurrency'), shown: false };
  return precisionMessage(t, trimmed, currency) ? { message: '', shown: true } : undefined;
 })();

 // Fills only what is still empty, so a read never overwrites what the owner typed.
 const prefill = (preview: LinkPreview) => {
  const marks: Field[] = [];
  const name = preview.product?.name ?? preview.title;
  if (name && !title.trim()) { setTitle(name); marks.push('title'); }
  if (preview.product?.brand && !brand.trim()) { setBrand(preview.product.brand); marks.push('brand'); }
  if (preview.product?.price && !price.trim()) { setPrice(preview.product.price); setCurrency(preview.product.currencyCode ?? currency); marks.push('price'); }
  if (preview.description && !description.trim()) { setDescription(preview.description); marks.push('description'); }
  setFilled(value => new Set([...value, ...marks]));
  setLinkImage(preview.imageUrl);
 };

 const importLinkPhoto = async () => {
  if (!linkImage) return;
  const captured = scope; setImporting(true); setError('');
  try {
   const result = await linkPreviewClient.importImage(linkImage);
   if (!valid(captured)) return;
   setMedia(value => [{ id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }, ...value.filter(item => item.id !== result.id)]);
   setLinkImage(null);
  } catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'The photo could not be copied')); }
  finally { if (valid(captured)) setImporting(false); }
 };

 const attachExisting = async () => {
  const captured = scope;
  try { await commands.membership(existingId, listId!, true); if (valid(captured)) back.goBack(); }
  catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Product could not be added')); }
 };

 const upload = async (files: File[]) => {
  const captured = scope; setPending(value => value + files.length); setError('');
  for (const file of files) {
   if (!valid(captured)) return;
   try { const result = await ProductsClient.upload(file, crypto.randomUUID()); if (!valid(captured)) return; setMedia(value => [...value, { id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }]); }
   catch (failure) { if (valid(captured)) setError(friendlyErrorMessage(failure, 'Upload failed')); }
   finally { if (valid(captured)) setPending(value => value - 1); }
  }
 };

 const linkError = urlFieldError(link);
 const notReady = Boolean(linkError) || saving || pending > 0 || importing || !title.trim() || !link.trim() || Boolean(priceProblem) || Boolean(productId && initialized.current !== scope);
 const save = async () => {
  if (!listId || notReady) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   // Ordered pairs; a repeated key keeps its first position and its last value.
   const specs = [...new Map(specifications.filter(entry => entry.key.trim() && entry.value.trim()).map(entry => [entry.key.trim(), entry.value.trim()] as const)).entries()].map(([key, value]) => ({ key, value }));
   const facts = { brand: blank(brand), logoUrl: null, description: blank(description), specifications: specs, imageUrls: [] as string[] };
   const amount = blank(price);
   const offer = { price: amount, currencyCode: amount === null ? null : currency, buyUrl: link.trim(), affiliateDisclosed };
   const draft = { title: title.trim(), productUrl: link.trim(), ...facts, offer, note: richNoteFromEditor(note), userRating: rating, mediaIds: media.map(item => item.id), curatedTermId };
   const signature = JSON.stringify(draft);
   assertCurrent(captured, operation);
   if (productId) {
    const observed = owner.content?.details.get(productId);
    if (!observed || draftObservation.current !== observed) throw new Error('Reload the product before saving');
    if (updateKey.current?.signature !== signature) updateKey.current = { signature, key: crypto.randomUUID() };
    assertCurrent(captured, operation);
    // productUrl is absent here on purpose: it is the shared identity, not an override.
    await ProductsClient.updateRecommendation(observed, { displayOverrides: { title: draft.title, ...facts }, note: draft.note, userRating: rating, mediaIds: draft.mediaIds, productOffer: offer, ...(curatedTouched ? { curatedTermId } : {}) }, updateKey.current.key, signal);
    assertCurrent(captured, operation);
   } else {
    if (intent.current?.scope !== captured || intent.current.signature !== signature) {
     const parent = await ProductsClient.observeCollection(listId, signal); assertCurrent(captured, operation);
     intent.current = { scope: captured, signature, value: ProductsClient.prepareManualIntent(parent, draft) };
    }
    assertCurrent(captured, operation); await ProductsClient.createManual(intent.current.value, signal); assertCurrent(captured, operation);
   }
   invalidateProducts(); toast.success('Product saved'); back.goBack({ state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(friendlyErrorMessage(failure, 'Product could not be saved')); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };

 // Edit controls require the actual complete owner observation. A loaded draft stays
 // owned by its original observation across refreshes and never rebases.
 if (productId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   <button aria-label={backText} onClick={() => back.goBack()}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit Product</h1>
   {owner.loading ? <p role="status">Loading product…</p> : <div role="alert"><p>{owner.error?.message || 'Product could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading product</button></div>}
  </div>;
 }

 const fromLink = (field: Field) => filled.has(field) && <span className="ml-2 text-xs text-blue-400">{t('products.form.filledFromLink', 'Filled from link')}</span>;
 const input = "block w-full bg-dashboard-muted rounded-xl p-3";
 const factsFull = specifications.length >= PRODUCT_SPEC_WRITE_LIMIT;

 return <AddItemPage
  title={productId ? 'Edit Product' : 'Add Product'} backLabel={backText} onBack={() => back.goBack()} mode="manual"
  bar={{ onCancel: () => back.goBack(), onSave: () => void save(), saving: saving ? 'save' : null, canSave: !notReady }}>
  {!productId && existingProducts.length > 0 && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
   <label className="block">Existing product
    <select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading} className={input}>
     <option value="">Select a product</option>
     {existingProducts.map(product => <option key={product.documentId} value={product.documentId}>{product.title}</option>)}
    </select>
   </label>
   <button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing product to this list</button>
  </section>}
  {owner.error && <p role="alert">{owner.error.message}</p>}

  <PasteLinkField label={t('products.form.whereToBuy', 'Where to buy')} value={link} onChange={setLink} onPrefill={prefill} placeholder="https://shop.example/product" disabled={saving} />
  {linkError && <p role="alert" className="text-sm text-red-400">{linkError}</p>}
  {linkImage && <div className="flex items-center gap-3">
   <img src={linkImage} alt="" className="h-16 w-16 rounded-lg object-cover" />
   <button type="button" onClick={() => void importLinkPhoto()} disabled={importing || saving} className="min-h-11 rounded-lg border border-white/10 px-3 text-sm">{t('products.form.usePhoto', 'Use this photo')}</button>
  </div>}

  <div><label htmlFor="product-title">Title</label>{fromLink('title')}<input id="product-title" value={title} onChange={event => { setTitle(event.target.value); touched('title'); }} disabled={saving} className={input} /></div>
  {!catalog.unconfigured && catalog.terms.length > 0 && <TaxonomyCombobox levels={1}
   terms={catalog.terms.map((term, position) => ({ id: term.id, parentId: null, position, label: term.label }))}
   value={{ categoryId: curatedTermId, subcategoryId: null }}
   onChange={value => { setCuratedTermId(value.categoryId); setCuratedTouched(true); }} />}
  <div><label htmlFor="product-brand">Brand</label>{fromLink('brand')}<input id="product-brand" value={brand} onChange={event => { setBrand(event.target.value); touched('brand'); }} disabled={saving} className={input} /></div>

  <div>
   <span className="mb-1 block text-sm font-medium">{t('currency.priceLabel')}{fromLink('price')}</span>
   <CurrencyPriceInput value={{ price: price || null, currencyCode: currency }} locale={locale} disabled={saving}
    onChange={value => { setPrice(value.price ?? ''); if (value.currencyCode || value.price === null) setCurrency(value.currencyCode); touched('price'); }} />
   {priceProblem && !priceProblem.shown && <p role="alert" className="mt-1 text-sm text-red-400">{priceProblem.message}</p>}
   <p className="text-sm text-dashboard-muted">{t('currency.emptyMeansUnknown')}</p>
  </div>

  <div><label htmlFor="product-description">Description</label>{fromLink('description')}<textarea id="product-description" value={description} onChange={event => { setDescription(event.target.value); touched('description'); }} disabled={saving} rows={3} className={`${input} resize-none`} /></div>

  <fieldset className="min-w-0"><legend>{t('products.form.keyFacts', 'Key facts')}</legend>
   {specRegion}
   {specifications.map((entry, index) => <div key={index} className="flex min-w-0 gap-2">
    <input aria-label={`Key fact name ${index + 1}`} value={entry.key} disabled={saving} onChange={event => setSpecifications(value => value.map((row, at) => at === index ? { ...row, key: event.target.value } : row))} placeholder="Name (e.g. Weight)" className="min-w-0 flex-1 bg-dashboard-muted rounded-xl p-2" />
    <input aria-label={`Key fact value ${index + 1}`} value={entry.value} disabled={saving} onChange={event => setSpecifications(value => value.map((row, at) => at === index ? { ...row, value: event.target.value } : row))} placeholder="Value (e.g. 240 g)" className="min-w-0 flex-1 bg-dashboard-muted rounded-xl p-2" />
    <button type="button" aria-label={`Remove key fact ${index + 1}`} disabled={saving} onClick={() => setSpecifications(value => value.filter((_row, at) => at !== index))}><X size={16} /></button>
    <button type="button" aria-label={`Move key fact ${index + 1} up`} disabled={saving || index === 0} onClick={() => moveSpecification(index, -1)} className="min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 disabled:opacity-40"><ArrowUp aria-hidden="true" size={14} /></button>
    <button type="button" aria-label={`Move key fact ${index + 1} down`} disabled={saving || index === specifications.length - 1} onClick={() => moveSpecification(index, 1)} className="min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 disabled:opacity-40"><ArrowDown aria-hidden="true" size={14} /></button>
   </div>)}
   <button type="button" disabled={saving || factsFull} onClick={() => setSpecifications(value => [...value, { key: '', value: '' }])}>{t('products.form.addKeyFact', '+ Add key fact')}</button>
   {factsFull && <p className="text-xs text-dashboard-muted">{t('products.form.keyFactsLimit', 'Up to 8 key facts.')}</p>}
  </fieldset>

  <label className="flex items-center gap-2">
   <input type="checkbox" checked={affiliateDisclosed} onChange={event => setAffiliateDisclosed(event.target.checked)} disabled={saving} className="h-5 w-5" />
   {t('products.form.affiliate', 'This is an affiliate link')}
  </label>

  <StarRating label="Your rating" value={rating} onChange={setRating} disabled={saving} />

  <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Share why you recommend this product..." /></div>

  <label className={uploadButton}><Upload aria-hidden="true" size={16} className="text-dashboard-muted" /><span>Photos</span><input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
  {pending > 0 && <p role="status">Uploading photos…</p>}
  {importing && <p role="status">Copying the photo…</p>}
  <ReorderableMediaStrip items={media} onChange={setMedia} noun="Photo" alt="Product photo" removeLabel="Remove photo" disabled={saving} />

  {error && <p role="alert">{error}</p>}
 </AddItemPage>;
}
