import ReorderableMediaStrip from '../../../../components/reorder/ReorderableMediaStrip';
import { useEffect, useRef, useState } from 'react';
import { friendlyErrorMessage, urlFieldError } from "../../../../utils/friendlyError";
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, ShoppingBag, X } from 'lucide-react';
import { moveItem } from '../../../../components/reorder/moveItem';
import { useMoveAnnouncer } from '../../../../components/reorder/useMoveAnnouncer';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation } from '../../../../lib/explorersApiClient';
import { ProductsClient, type ManualProductIntent } from '../../api/productsClient';
import { useProductsCommands } from '../../api/query';
import { invalidateProducts, useProductsOwner } from '../../hooks/useProductsOwner';
import { productAmountSchema } from '../../../../../../tunes/shared/explorersProductContract';
import CurrencyPicker from '../../../../components/ui/CurrencyPicker';
import { suggestedCurrency } from '../../../../lib/currencyOptions';
import { precisionMessage } from '../../../../lib/money';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';

/**
 * Ticket 4.4. Native Products add/edit page.
 *
 * Three things the Strapi version did are gone rather than ported:
 *
 *  - The paste-a-link step posted to /api/products/scrape-link. The dev proxy still
 *    forwards that path to the Tunes server, but the server has no such route, so the
 *    step called a dead endpoint and discarded the draft when it failed. With no
 *    enrichment there is nothing to auto-fill and nothing to flag as unverified, which is
 *    what the scraped-price guard existed for; manual entry is now the only path and is
 *    preserved by construction.
 *  - Images came back from the scraper as external URLs to select. Owner imagery is media
 *    through the native route; imageUrls remain in the contract for approved provider
 *    images, and no provider exists for Products.
 *  - The category selector read a Strapi taxonomy with no canonical replacement, and the
 *    projection serves product_category as null.
 *
 * Price is a text field, not type="number". The amount is an exact decimal string all the
 * way to numeric(20,6), and routing it through a JS number would be the one place a float
 * could round an owner's price. The currency's minor units bound the precision, so "19.90"
 * is accepted as USD and refused as JPY. Every active ISO 4217 currency is offered.
 *
 * A price needs a currency (an amount nobody can read is not a price) and a currency needs a
 * price. The picker starts on the currency of the person's region when the browser reports
 * one, never on a guess, and an empty price drops the currency instead of failing on it.
 *
 * The product URL is the shared entity's identity and is excluded from the override
 * vocabulary, so editing an existing recommendation cannot change it.
 */
export default function AddProductPage() {
 const { listId, productId } = useParams<{ listId: string; productId?: string }>();
 const location = useLocation(), navigate = useNavigate();
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId);
 const scope = JSON.stringify([generation, accountId, location.pathname, listId, productId]);
 const currentScope = useRef(scope); currentScope.current = scope;
 const active = useRef(0), controller = useRef<AbortController>();
 const owner = useProductsOwner(undefined, true), commands = useProductsCommands();
 const { t, i18n } = useTranslation();
 // Only a new product starts on a suggestion; an existing one shows what is stored.
 const suggestion = suggestedCurrency([i18n?.language, ...(typeof navigator === 'undefined' ? [] : navigator.languages ?? [])]) ?? '';
 const initialCurrency = productId ? '' : suggestion;

 const [existingId, setExistingId] = useState('');
 const existingProducts = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_products) ?? []).filter(product => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_products.some(member => member.documentId === product.documentId)).map(product => [product.documentId, product])).values()];

 const [title, setTitle] = useState(''), [productUrl, setProductUrl] = useState('');
 const [brand, setBrand] = useState(''), [logoUrl, setLogoUrl] = useState('');
 const [description, setDescription] = useState(''), [buyUrl, setBuyUrl] = useState('');
 const [price, setPrice] = useState(''), [currency, setCurrency] = useState<string>(initialCurrency);
 const [specifications, setSpecifications] = useState<{ key: string; value: string }[]>([]);
 const [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [saving, setSaving] = useState(false), [error, setError] = useState('');
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const intent = useRef<{ scope: string; signature: string; value: ManualProductIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);
 // Specification order is the order they are shown on the public product page.
 const { announce: announceSpec, region: specRegion } = useMoveAnnouncer();
 const moveSpecification = (index: number, delta: -1 | 1) => { setSpecifications(value => moveItem(value, index, index + delta)); announceSpec(`Specification ${index + 1}`, index + delta + 1, specifications.length); };

 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setTitle(''); setProductUrl(''); setBrand(''); setLogoUrl(''); setDescription(''); setBuyUrl(''); setPrice(''); setCurrency(initialCurrency); setSpecifications([]); setNote(''); setRating(null); setMedia([]); setPending(0); setSaving(false); setError(''); setExistingId(''); }, [scope]);

 useEffect(() => {
  if (!productId || !owner.content || initialized.current === scope) return;
  const product = owner.content.view.lists.find(list => list.documentId === listId)?.recommended_products.find(row => row.documentId === productId);
  const observed = owner.content.details.get(productId);
  if (!product || !observed) return;
  initialized.current = scope; draftObservation.current = observed;
  setTitle(product.title); setProductUrl(product.product_url); setBrand(product.brand ?? '');
  setLogoUrl(product.logo_url ?? ''); setDescription(product.description ?? ''); setBuyUrl(product.buy_url ?? '');
  // The exact decimal is read back from the observation, not from the display number.
  const offer = observed.detail.category === 'products' ? observed.detail.productOffer : undefined;
  setPrice(offer?.price ?? ''); setCurrency(offer?.currencyCode ?? '');
  setSpecifications(product.specification_list ? product.specification_list.map(entry => ({ ...entry })) : Object.entries(product.specifications ?? {}).map(([key, value]) => ({ key, value })));
  setNote(typeof product.user_recommendation_note === 'string' ? product.user_recommendation_note : '');
  setRating(product.user_rating);
  // Without this the form starts empty and save() sends mediaIds: [], silently detaching
  // every snapshot the owner already uploaded. mediaIds is on every recommendation detail,
  // so unlike appScreenshots it needs no category guard.
  setMedia((observed.detail.mediaIds ?? []).map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
 }, [owner.content, scope, productId, listId]);

 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('Product owner or route changed'); };
 const blank = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };

 // Reported before any command is dispatched, so an impossible amount never reaches the
 // transport and the draft is never discarded to find out.
 const priceProblem = (() => {
  const trimmed = price.trim();
  if (trimmed === '') return undefined;
  if (!productAmountSchema.safeParse(trimmed).success) return t('currency.invalidAmount');
  if (currency === '') return t('currency.needsCurrency');
  return precisionMessage(t, trimmed, currency);
 })();

 const attachExisting = async () => {
  const captured = scope;
  try { await commands.membership(existingId, listId!, true); if (valid(captured)) navigate(`/recommendations/products/${listId}`); }
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

 const urlErrors = { productUrl: urlFieldError(productUrl), logoUrl: urlFieldError(logoUrl), buyUrl: urlFieldError(buyUrl) };
 const hasUrlError = Object.values(urlErrors).some(Boolean);
 const save = async () => {
  if (hasUrlError) return;
  if (!listId || pending || saving || !title.trim() || !productUrl.trim() || priceProblem || (productId && initialized.current !== scope)) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   // Ordered pairs; a repeated key keeps its first position and its last value.
   const specs = [...new Map(specifications.filter(entry => entry.key.trim() && entry.value.trim()).map(entry => [entry.key.trim(), entry.value.trim()] as const)).entries()].map(([key, value]) => ({ key, value }));
   const facts = { brand: blank(brand), logoUrl: blank(logoUrl), description: blank(description), specifications: specs, imageUrls: [] as string[] };
   // An empty amount is unknown, never zero, and a currency with no amount names nothing, so
   // the two travel together or not at all.
   const amount = blank(price);
   const offer = { price: amount, currencyCode: amount === null || currency === '' ? null : currency, buyUrl: blank(buyUrl) };
   const draft = { title: title.trim(), productUrl: productUrl.trim(), ...facts, offer, note: richNoteFromEditor(note), userRating: rating, mediaIds: media.map(item => item.id) };
   const signature = JSON.stringify(draft);
   assertCurrent(captured, operation);
   if (productId) {
    const observed = owner.content?.details.get(productId);
    if (!observed || draftObservation.current !== observed) throw new Error('Reload the product before saving');
    if (updateKey.current?.signature !== signature) updateKey.current = { signature, key: crypto.randomUUID() };
    assertCurrent(captured, operation);
    // productUrl is absent here on purpose: it is not in the override vocabulary.
    await ProductsClient.updateRecommendation(observed, { displayOverrides: { title: draft.title, ...facts }, note: draft.note, userRating: rating, mediaIds: draft.mediaIds, productOffer: offer }, updateKey.current.key, signal);
    assertCurrent(captured, operation);
   } else {
    if (intent.current?.scope !== captured || intent.current.signature !== signature) {
     const parent = await ProductsClient.observeCollection(listId, signal); assertCurrent(captured, operation);
     intent.current = { scope: captured, signature, value: ProductsClient.prepareManualIntent(parent, draft) };
    }
    assertCurrent(captured, operation); await ProductsClient.createManual(intent.current.value, signal); assertCurrent(captured, operation);
   }
   invalidateProducts(); toast.success('Product saved'); navigate(`/recommendations/products/${listId}`, { state: { justAddedRecommendation: true } });
  } catch (failure) { if (valid(captured, operation)) setError(friendlyErrorMessage(failure, 'Product could not be saved')); }
  finally { if (valid(captured, operation)) setSaving(false); }
 };

 // Edit controls require the actual complete owner observation. A loaded draft stays
 // owned by its original observation across refreshes and never rebases.
 if (productId && initialized.current !== scope) {
  return <div className="min-h-screen text-dashboard p-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   <button aria-label="Back to product list" onClick={() => navigate(`/recommendations/products/${listId}`)}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">Edit Product</h1>
   {owner.loading ? <p role="status">Loading product…</p> : <div role="alert"><p>{owner.error?.message || 'Product could not be loaded. Refresh before editing.'}</p><button onClick={owner.refetch}>Retry loading product</button></div>}
  </div>;
 }

 return <div className="min-h-screen text-dashboard">
  <header className="border-b border-dashboard-border px-4 md:px-6 py-3 flex items-center gap-3">
   <button aria-label="Back to product list" onClick={() => navigate(`/recommendations/products/${listId}`)}><ArrowLeft size={20} /></button>
   <h1 className="font-semibold">{productId ? 'Edit Product' : 'Add Product'}</h1>
  </header>
  <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
   {!productId && existingProducts.length > 0 && <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
    <label className="block">Existing product
     <select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={commands.loading} className="block w-full bg-dashboard-muted rounded-xl p-3">
      <option value="">Select a product</option>
      {existingProducts.map(product => <option key={product.documentId} value={product.documentId}>{product.title}</option>)}
     </select>
    </label>
    <button disabled={!existingId || commands.loading} onClick={attachExisting}>Add existing product to this list</button>
   </section>}

   <section className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-5">
    <h2 className="font-semibold flex gap-2"><ShoppingBag size={18} />{productId ? 'My Product' : 'Add manually'}</h2>
    {productId && owner.loading && <p role="status">Loading product…</p>}
    {owner.error && <p role="alert">{owner.error.message}</p>}

    <label className="block">Title<input value={title} onChange={event => setTitle(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {/* The asterisk is drawn by CSS so the field's accessible name stays "Product URL". */}
    <label className="block"><span className="after:content-['_*'] after:text-red-500">Product URL</span>
     <input value={productUrl} onChange={event => setProductUrl(event.target.value)} disabled={saving || Boolean(productId)} required aria-required="true" aria-describedby={productId ? undefined : 'product-url-required'} placeholder="https://example.com/widget" className="block w-full bg-dashboard-muted rounded-xl p-3" />
    </label>
    {urlErrors.productUrl && <p role="alert" className="text-sm text-red-400">{urlErrors.productUrl}</p>}
    {!productId && <p id="product-url-required" className="text-xs text-dashboard-muted">Required: Save stays off until the product's link is added (its official or shop page).</p>}
    {productId
     ? <p className="text-sm text-dashboard-muted">The product URL identifies the product itself and is shared with everyone who recommends it, so it cannot be changed here.</p>
     : <p className="text-sm text-dashboard-muted">Details are not fetched automatically. Fill in whatever you know; nothing you type is discarded.</p>}

    <label className="block">Brand<input value={brand} onChange={event => setBrand(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Logo URL<input value={logoUrl} onChange={event => setLogoUrl(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {urlErrors.logoUrl && <p role="alert" className="text-sm text-red-400">{urlErrors.logoUrl}</p>}

    <label className="block">{t('currency.priceLabel')}
     {/* Text, not number: the amount stays an exact decimal string end to end. */}
     <input value={price} inputMode="decimal" onChange={event => setPrice(event.target.value)} disabled={saving} placeholder="79.99" aria-invalid={Boolean(priceProblem) || undefined} className="block w-full bg-dashboard-muted rounded-xl p-3 text-base" />
    </label>
    <div>
     <label htmlFor="product-currency" className="block">{t('currency.label')}</label>
     <CurrencyPicker inputId="product-currency" value={currency} onChange={setCurrency} disabled={saving} invalid={Boolean(priceProblem) && price.trim() !== '' && currency === ''} />
    </div>
    {priceProblem && <p role="alert">{priceProblem}</p>}
    <p className="text-sm text-dashboard-muted">{t('currency.emptyMeansUnknown')}</p>

    <label className="block">Buy / Affiliate URL<input value={buyUrl} onChange={event => setBuyUrl(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    {urlErrors.buyUrl && <p role="alert" className="text-sm text-red-400">{urlErrors.buyUrl}</p>}
    <label className="block">Description<textarea value={description} onChange={event => setDescription(event.target.value)} disabled={saving} rows={3} className="block w-full bg-dashboard-muted rounded-xl p-3 resize-none" /></label>

    <fieldset><legend>Specifications</legend>
     {specRegion}
     {specifications.map((entry, index) => <div key={index} className="flex min-w-0 gap-2">
      <input aria-label={`Specification key ${index + 1}`} value={entry.key} disabled={saving} onChange={event => setSpecifications(value => value.map((row, at) => at === index ? { ...row, key: event.target.value } : row))} placeholder="Key (e.g. Color)" className="min-w-0 flex-1 bg-dashboard-muted rounded-xl p-2" />
      <input aria-label={`Specification value ${index + 1}`} value={entry.value} disabled={saving} onChange={event => setSpecifications(value => value.map((row, at) => at === index ? { ...row, value: event.target.value } : row))} placeholder="Value (e.g. Space Grey)" className="min-w-0 flex-1 bg-dashboard-muted rounded-xl p-2" />
      <button aria-label={`Remove specification ${index + 1}`} disabled={saving} onClick={() => setSpecifications(value => value.filter((_row, at) => at !== index))}><X size={16} /></button>
      <button type="button" aria-label={`Move specification ${index + 1} up`} disabled={saving || index === 0} onClick={() => moveSpecification(index, -1)} className="min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 disabled:opacity-40"><ArrowUp aria-hidden="true" size={14} /></button>
      <button type="button" aria-label={`Move specification ${index + 1} down`} disabled={saving || index === specifications.length - 1} onClick={() => moveSpecification(index, 1)} className="min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 disabled:opacity-40"><ArrowDown aria-hidden="true" size={14} /></button>
     </div>)}
     <button disabled={saving || specifications.length >= 200} onClick={() => setSpecifications(value => [...value, { key: '', value: '' }])}>Add specification</button>
    </fieldset>

    <label className="block">Your rating
     <select value={rating ?? ''} onChange={event => setRating(event.target.value ? Number(event.target.value) : null)} disabled={saving} className="block bg-dashboard-muted p-2">
      <option value="">No rating</option>
      {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
     </select>
    </label>

    <div><h3>My Thoughts</h3><TiptapEditor value={note} onChange={setNote} placeholder="Share why you recommend this product..." /></div>

    <label className="block">Snapshots<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving || pending > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
    {pending > 0 && <p role="status">Uploading snapshots…</p>}
    <ReorderableMediaStrip items={media} onChange={setMedia} noun="Snapshot" alt="Product snapshot" removeLabel="Remove snapshot" disabled={saving} />

    {error && <p role="alert">{error}</p>}
    <button onClick={save} disabled={hasUrlError || saving || pending > 0 || !title.trim() || !productUrl.trim() || Boolean(priceProblem) || Boolean(productId && initialized.current !== scope)} className="bg-dashboard-accent text-white rounded-xl px-5 py-3">
     {saving && <Loader2 className="inline animate-spin mr-2" size={16} />}Save product
    </button>
   </section>
  </div>
 </div>;
}
