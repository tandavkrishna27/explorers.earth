import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ShoppingBag, X } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '../../../../store/store';
import type { RecommendationObservation } from '../../../../lib/explorersApiClient';
import { ProductsClient, type ManualProductIntent } from '../../api/productsClient';
import { useProductsCommands } from '../../api/query';
import { invalidateProducts, useProductsOwner } from '../../hooks/useProductsOwner';
import { SUPPORTED_CURRENCIES, productAmountSchema, amountScale, currencyMinorUnits, type SupportedCurrency } from '../../../../../../tunes/shared/explorersProductContract';
import { richNoteFromEditor } from '../../../../../../tunes/shared/explorersRichNoteContract';
import TiptapEditor from '../../../Favorites/components/TiptapEditor';

const CURRENCIES = Object.keys(SUPPORTED_CURRENCIES) as SupportedCurrency[];

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
 * is accepted as USD and refused as JPY.
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

 const [existingId, setExistingId] = useState('');
 const existingProducts = [...new Map((owner.content?.view.lists.flatMap(list => list.recommended_products) ?? []).filter(product => !owner.content?.view.lists.find(list => list.documentId === listId)?.recommended_products.some(member => member.documentId === product.documentId)).map(product => [product.documentId, product])).values()];

 const [title, setTitle] = useState(''), [productUrl, setProductUrl] = useState('');
 const [brand, setBrand] = useState(''), [logoUrl, setLogoUrl] = useState('');
 const [description, setDescription] = useState(''), [buyUrl, setBuyUrl] = useState('');
 const [price, setPrice] = useState(''), [currency, setCurrency] = useState<SupportedCurrency | ''>('');
 const [specifications, setSpecifications] = useState<{ key: string; value: string }[]>([]);
 const [note, setNote] = useState(''), [rating, setRating] = useState<number | null>(null);
 const [media, setMedia] = useState<{ id: string; url: string }[]>([]), [pending, setPending] = useState(0);
 const [saving, setSaving] = useState(false), [error, setError] = useState('');
 const initialized = useRef(''), draftObservation = useRef<RecommendationObservation>();
 const intent = useRef<{ scope: string; signature: string; value: ManualProductIntent }>();
 const updateKey = useRef<{ signature: string; key: string }>();
 const mounted = useRef(true);

 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); active.current++; }; }, []);
 useEffect(() => { controller.current?.abort(); active.current++; initialized.current = ''; intent.current = undefined; updateKey.current = undefined; draftObservation.current = undefined; setTitle(''); setProductUrl(''); setBrand(''); setLogoUrl(''); setDescription(''); setBuyUrl(''); setPrice(''); setCurrency(''); setSpecifications([]); setNote(''); setRating(null); setMedia([]); setPending(0); setSaving(false); setError(''); setExistingId(''); }, [scope]);

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
  setPrice(offer?.price ?? ''); setCurrency((offer?.currencyCode as SupportedCurrency | null) ?? '');
  setSpecifications(Object.entries(product.specifications ?? {}).map(([key, value]) => ({ key, value })));
  setNote(typeof product.user_recommendation_note === 'string' ? product.user_recommendation_note : '');
  setRating(product.user_rating);
 }, [owner.content, scope, productId, listId]);

 const valid = (captured: string, operation?: number) => mounted.current && currentScope.current === captured && (operation === undefined || active.current === operation);
 const assertCurrent = (captured: string, operation: number) => { if (!valid(captured, operation) || controller.current?.signal.aborted) throw new Error('Product owner or route changed'); };
 const blank = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };

 // Reported before any command is dispatched, so an impossible amount never reaches the
 // transport and the draft is never discarded to find out.
 const priceProblem = (() => {
  const trimmed = price.trim();
  if (trimmed === '') return undefined;
  if (!productAmountSchema.safeParse(trimmed).success) return 'Enter an amount like 19.90, with no currency symbol.';
  if (currency !== '' && amountScale(trimmed) > currencyMinorUnits(currency)) return `${currency} does not have that many decimal places.`;
  return undefined;
 })();

 const attachExisting = async () => {
  const captured = scope;
  try { await commands.membership(existingId, listId!, true); if (valid(captured)) navigate(`/recommendations/products/${listId}`); }
  catch (failure) { if (valid(captured)) setError(failure instanceof Error ? failure.message : 'Product could not be added'); }
 };

 const upload = async (files: File[]) => {
  const captured = scope; setPending(value => value + files.length); setError('');
  for (const file of files) {
   if (!valid(captured)) return;
   try { const result = await ProductsClient.upload(file, crypto.randomUUID()); if (!valid(captured)) return; setMedia(value => [...value, { id: result.id, url: `/api/explorers/v1/media/${result.id}/content` }]); }
   catch (failure) { if (valid(captured)) setError(failure instanceof Error ? failure.message : 'Upload failed'); }
   finally { if (valid(captured)) setPending(value => value - 1); }
  }
 };

 const save = async () => {
  if (!listId || pending || saving || !title.trim() || !productUrl.trim() || priceProblem || (productId && initialized.current !== scope)) return;
  const captured = scope, operation = ++active.current; controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
  setSaving(true); setError('');
  try {
   const specs = Object.fromEntries(specifications.filter(entry => entry.key.trim() && entry.value.trim()).map(entry => [entry.key.trim(), entry.value.trim()]));
   const facts = { brand: blank(brand), logoUrl: blank(logoUrl), description: blank(description), specifications: specs, imageUrls: [] as string[] };
   // An empty amount is unknown, never zero; an empty currency stays unknown.
   const offer = { price: blank(price), currencyCode: currency === '' ? null : currency, buyUrl: blank(buyUrl) };
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
  } catch (failure) { if (valid(captured, operation)) setError(failure instanceof Error ? failure.message : 'Product could not be saved'); }
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
    <label className="block">Product URL
     <input value={productUrl} onChange={event => setProductUrl(event.target.value)} disabled={saving || Boolean(productId)} placeholder="https://example.com/widget" className="block w-full bg-dashboard-muted rounded-xl p-3" />
    </label>
    {productId
     ? <p className="text-sm text-dashboard-muted">The product URL identifies the product itself and is shared with everyone who recommends it, so it cannot be changed here.</p>
     : <p className="text-sm text-dashboard-muted">Details are not fetched automatically. Fill in whatever you know; nothing you type is discarded.</p>}

    <label className="block">Brand<input value={brand} onChange={event => setBrand(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Logo URL<input value={logoUrl} onChange={event => setLogoUrl(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>

    <label className="block">Price
     {/* Text, not number: the amount stays an exact decimal string end to end. */}
     <input value={price} inputMode="decimal" onChange={event => setPrice(event.target.value)} disabled={saving} placeholder="79.99" className="block w-full bg-dashboard-muted rounded-xl p-3" />
    </label>
    <label className="block">Currency
     <select value={currency} onChange={event => setCurrency(event.target.value as SupportedCurrency | '')} disabled={saving} className="block bg-dashboard-muted p-2">
      <option value="">Unknown</option>
      {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
     </select>
    </label>
    {priceProblem && <p role="alert">{priceProblem}</p>}
    <p className="text-sm text-dashboard-muted">An empty price means unknown, not free. Leave the currency as Unknown rather than guessing one.</p>

    <label className="block">Buy / Affiliate URL<input value={buyUrl} onChange={event => setBuyUrl(event.target.value)} disabled={saving} className="block w-full bg-dashboard-muted rounded-xl p-3" /></label>
    <label className="block">Description<textarea value={description} onChange={event => setDescription(event.target.value)} disabled={saving} rows={3} className="block w-full bg-dashboard-muted rounded-xl p-3 resize-none" /></label>

    <fieldset><legend>Specifications</legend>
     {specifications.map((entry, index) => <div key={index} className="flex gap-2">
      <input aria-label={`Specification key ${index + 1}`} value={entry.key} disabled={saving} onChange={event => setSpecifications(value => value.map((row, at) => at === index ? { ...row, key: event.target.value } : row))} placeholder="Key (e.g. Color)" className="bg-dashboard-muted rounded-xl p-2" />
      <input aria-label={`Specification value ${index + 1}`} value={entry.value} disabled={saving} onChange={event => setSpecifications(value => value.map((row, at) => at === index ? { ...row, value: event.target.value } : row))} placeholder="Value (e.g. Space Grey)" className="bg-dashboard-muted rounded-xl p-2" />
      <button aria-label={`Remove specification ${index + 1}`} disabled={saving} onClick={() => setSpecifications(value => value.filter((_row, at) => at !== index))}><X size={16} /></button>
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
    <div className="flex flex-wrap gap-3">{media.map(item => <div key={item.id}>
     <img className="w-24 h-24 object-cover rounded" src={item.url} alt="Product snapshot" />
     <button aria-label="Remove snapshot" disabled={saving} onClick={() => setMedia(value => value.filter(row => row.id !== item.id))}><X size={16} /></button>
    </div>)}</div>

    {error && <p role="alert">{error}</p>}
    <button onClick={save} disabled={saving || pending > 0 || !title.trim() || !productUrl.trim() || Boolean(priceProblem) || Boolean(productId && initialized.current !== scope)} className="bg-dashboard-accent text-white rounded-xl px-5 py-3">
     {saving && <Loader2 className="inline animate-spin mr-2" size={16} />}Save product
    </button>
   </section>
  </div>
 </div>;
}
