import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, ShoppingBag, ChevronRight, Loader2, X
} from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import useAuthStore from "../../../store/store";
import { getGuardedParentCreateFailure } from "../../../lib/explorersApiClient";
import { generateSlug } from "../../Products/utils/productHelpers";
import { getCurrentDomain } from "../../../utils/getCurrentDomain";
// Ticket 5.2. Linking runs on the native owner API: the location and its linked lists
// come from the owner reads, and attach/detach/create-linked are owner commands.
import { usePlacesOwner } from "../hooks/usePlacesOwner";
import { usePlacesCommands } from "../api/placesCommands";
import { useProductsOwner } from "../../Products/hooks/useProductsOwner";
import { useProductsCommands, useProductsCallerCustody } from "../../Products/api/query";

// ── Fetch location + its linked product lists ─────────────────
// The location and its linked lists come from the owner reads; the two Strapi
// documents that used to serve this page are gone with ticket 5.2.

// ── Product List Selection Card ───────────────────────────────
const SelectProductListCard = ({
  list,
  onSelect,
}: {
  list: any;
  onSelect: () => void;
}) => {
  const products: any[] = list.recommended_products || [];
  const count = products.length;
  const preview = products.slice(0, 4);

  return (
    <motion.div
      onClick={onSelect}
      className="bg-dashboard-sidebar border border-white/5 hover:border-dashboard-accent/40 rounded-2xl p-5 cursor-pointer transition-all group"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-dashboard truncate">{list.List_Name}</h3>
            <span className={`text-[10px] font-semibold text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider font-poppins shrink-0 ${list.Visibility ? "bg-emerald-500/90" : "bg-slate-500/90"}`}>
              {list.Visibility ? "Public" : "Draft"}
            </span>
          </div>
          <p className="text-xs text-dashboard-muted">{count} product{count !== 1 ? "s" : ""} added</p>
        </div>
        <span className="flex items-center gap-1 text-blue-400 group-hover:text-blue-300 transition-colors font-medium text-sm">
          Add to this <ChevronRight size={14} />
        </span>
      </div>
      {preview.length > 0 ? (
        <div className="flex gap-2">
          {preview.map((p: any) => (
            <div key={p.documentId} className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/5 ring-1 ring-white/10">
              {p.logo_url ? (
                <img src={p.logo_url} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-orange-950/40 flex items-center justify-center">
                  <ShoppingBag size={10} className="text-orange-400/40" />
                </div>
              )}
            </div>
          ))}
          {count > 4 && (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 flex-shrink-0 ring-1 ring-white/10">
              <span className="text-xs text-dashboard-muted">+{count - 4}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="h-10 rounded-lg bg-white/3 border border-dashed border-dashboard-border flex items-center justify-center">
          <p className="text-xs text-dashboard-muted">No products yet — be the first to add</p>
        </div>
      )}
    </motion.div>
  );
};

// ── Create New Linked Product List Form ───────────────────────
const CreateLinkedProductListForm = ({
  locationId,
  locationName,
  username,
  onCreated,
  onCancel,
}: {
  locationId: string;
  locationName: string;
  username: string;
  onCreated: (newListId: string) => void;
  onCancel: () => void;
}) => {
  const commands = useProductsCommands();
  const loading = commands.loading;
  const takeCustody = useProductsCallerCustody();
  const currentParent = useRef(locationId); currentParent.current = locationId;
  const closed = useRef(false);
  const previousInput = useRef<ReturnType<typeof inputFor>>();
  const unresolvedInputs = useRef(new Set<string>());
  const [message, setMessage] = useState('');
  const inputFor = (values: { List_Name: string; slug: string; list_description: string }) => ({ title: values.List_Name, slug: values.slug || generateSlug(values.List_Name), description: values.list_description || null, parentLocationCollectionId: locationId });
  const submit = async (values: { List_Name: string; slug: string; list_description: string }, recovery = false) => {
    const valid = takeCustody(), parent = locationId, input = inputFor(values);
    const owns = () => !closed.current && currentParent.current === parent && valid();
    const previous = previousInput.current;
    const supersedesPending = previous !== undefined && JSON.stringify(previous) !== JSON.stringify(input) && commands.getLinkedCreateStatus(previous) === 'pending';
    try {
      const work = recovery ? commands.retryLinkedCreate(input) : commands.createList(input);
      if (commands.getLinkedCreateStatus(input) === 'pending') previousInput.current = input;
      if (owns() && supersedesPending && commands.getLinkedCreateStatus(previous!) === 'blocked') {
        const notice = 'An earlier create may have completed. Check your lists before creating it again.';
        unresolvedInputs.current.add(JSON.stringify(previous));
        setMessage(notice); toast.warning(notice, { duration: Infinity });
      }
      const created = await work;
      if (!owns()) return;
      toast.success("Products list created and linked to location!");
      onCreated(created.id);
    } catch (error) {
      if (!owns()) return;
      const status = commands.getLinkedCreateStatus(input);
      const signature = JSON.stringify(input);
      if (status === 'uncertain') unresolvedInputs.current.add(signature);
      const locallyInvalid = getGuardedParentCreateFailure(error)?.kind === 'local-rejection' && !unresolvedInputs.current.has(signature);
      const text = locallyInvalid ? 'The list details are invalid. Check your entries before retrying.' : status === 'conflict' ? 'The location command conflicted. Refresh the location and retry.' : status === 'uncertain' || status === 'blocked' ? 'The create outcome is uncertain and needs checking. A retry uses the original command while available.' : 'Failed to create list. Please try again.';
      setMessage(text); toast.error(text);
    }
  };
  const cancel = () => { closed.current = true; takeCustody(); commands.cancelLinkedCreate(); onCancel(); };

  const formik = useFormik({
    initialValues: { List_Name: "", list_description: "", slug: "" },
    validationSchema: Yup.object({
      List_Name: Yup.string().required("List name is required").max(100),
      slug: Yup.string().required("List URL is required").max(100),
    }),
    onSubmit: values => submit(values),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dashboard-sidebar border border-dashboard-accent/20 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-bold text-dashboard">Create New Product List</h3>
        <button onClick={cancel} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-dashboard-muted hover:text-dashboard transition-colors">
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-dashboard-muted mb-4">
        This list will be linked to <span className="text-dashboard-accent font-semibold">{locationName}</span> and also available independently in your Products dashboard.
      </p>
      <form onSubmit={formik.handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-dashboard mb-1.5 block">List Name *</label>
          <input
            type="text"
            name="List_Name"
            placeholder="e.g. Paris Essentials, Travel Gear"
            value={formik.values.List_Name}
            onChange={(e) => { formik.handleChange(e); formik.setFieldValue("slug", generateSlug(e.target.value)); }}
            onBlur={formik.handleBlur}
            className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-colors"
          />
          {formik.touched.List_Name && formik.errors.List_Name && (
            <p className="text-xs text-red-400 mt-1">{formik.errors.List_Name}</p>
          )}
        </div>
        <div>
          <label className="text-sm font-semibold text-dashboard mb-1.5 block">Description</label>
          <textarea
            name="list_description"
            placeholder="Describe what's in this product collection"
            rows={2}
            value={formik.values.list_description}
            onChange={formik.handleChange}
            className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-3 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-colors resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-dashboard mb-1.5 block">List URL *</label>
          <div className="flex flex-col md:flex-row md:items-center gap-1">
            <span className="text-sm text-dashboard-muted shrink-0">{getCurrentDomain()}/{username}/products/</span>
            <input
              type="text"
              name="slug"
              placeholder="my-list-url"
              value={formik.values.slug}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full bg-dashboard-muted border border-dashboard-border rounded-lg px-4 py-2.5 text-sm text-dashboard placeholder-dashboard-muted focus:outline-none focus:border-dashboard-accent transition-colors"
            />
          </div>
          {formik.touched.slug && formik.errors.slug && (
            <p className="text-xs text-red-400 mt-1">{formik.errors.slug}</p>
          )}
        </div>
        {message && <p role="status" className="text-sm text-dashboard-muted">{message}</p>}
        {commands.getLinkedCreateStatus(inputFor(formik.values)) === 'conflict' && <button type="button" disabled={loading} onClick={() => submit(formik.values, true)}>Refresh location and retry</button>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={cancel} className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-dashboard transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="px-5 py-2.5 rounded-lg bg-dashboard-accent hover:opacity-90 text-sm text-white font-medium transition-all flex items-center gap-2 disabled:opacity-60">
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create & Add Products
          </button>
        </div>
      </form>
    </motion.div>
  );
};

// ── Main Page ─────────────────────────────────────────────────
const AddLinkedProductsPage = () => {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Ticket 5.2. The location and the owner's own lists come from the owner reads; the
  // location says which of those lists are linked to it.
  // Every location, not just this one: the union of their linked ids is exactly the
  // set of lists that already have a parent, which is what must not be offered here.
  const places = usePlacesOwner();
  const owner = useProductsOwner();
  const commands = usePlacesCommands();
  const username = user?.username || "";

  const location = places.data?.recommendationLists?.find((entry) => entry.documentId === locationId);
  const loading = places.loading || owner.loading;
  const linkedIds: string[] = location?.linked_product_list_ids ?? [];
  const allLists: any[] = owner.data?.productLists ?? [];
  const linkedLists = allLists.filter((list) => linkedIds.includes(list.documentId));
  // A list is attachable when it has no location of its own yet. One parent per list, so
  // a list already linked elsewhere is not offered here.
  const linkedAnywhere = new Set<string>((places.data?.recommendationLists ?? []).flatMap((entry) => entry.linked_product_list_ids));
  const attachableLists = allLists.filter((list) => !linkedAnywhere.has(list.documentId));

  const handleSelectExistingList = (listId: string) => {
    navigate(`/recommendations/products/${listId}/add?redirectBack=/recommendations`);
  };

  const handleListCreated = (newListId: string) => {
    navigate(`/recommendations/products/${newListId}/add?redirectBack=/recommendations`);
  };

  const handleAttach = async (listId: string) => {
    if (!locationId) return;
    try {
      await commands.setLocationLink(locationId, listId, true);
      places.refetch();
      owner.refetch();
      toast.success("List linked to this location");
    } catch {
      toast.error("That list could not be linked. It may already belong to another location.");
    }
  };

  const handleDetach = async (listId: string) => {
    if (!locationId) return;
    try {
      // Detaching leaves the list and everything in it; only the link goes.
      await commands.setLocationLink(locationId, listId, false);
      places.refetch();
      owner.refetch();
      toast.success("List unlinked. It is still in your dashboard.");
    } catch {
      toast.error("That list could not be unlinked. Please try again.");
    }
  };

  const handleBack = () => {
    navigate("/recommendations");
  };

  return (
    <div className="px-4 md:px-8 pt-4 pb-24 md:pb-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleBack}
          className="p-2 rounded-xl bg-dashboard-muted hover:bg-dashboard-sidebar transition-colors text-dashboard-muted hover:text-dashboard"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-dashboard">Add Products</h1>
          {location?.List_Name && (
            <p className="text-sm text-dashboard-muted">
              Linking to: <span className="text-dashboard-accent font-semibold">{location.List_Name}</span>
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-dashboard-accent" />
        </div>
      )}

      {!loading && (
        <>
          {/* Lists already linked to this location, each unlinkable without losing it */}
          {linkedLists.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-dashboard mb-3">Lists already linked to this location</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {linkedLists.map((list: any) => (
                  <div key={list.documentId} className="flex flex-col gap-2">
                    <SelectProductListCard
                      list={list}
                      onSelect={() => handleSelectExistingList(list.documentId)}
                    />
                    <button
                      type="button"
                      onClick={() => handleDetach(list.documentId)}
                      disabled={commands.loading}
                      className="self-end text-xs text-dashboard-muted hover:text-dashboard-danger transition-colors disabled:opacity-60"
                    >
                      Unlink from this location
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lists of this kind that belong to no location yet */}
          {attachableLists.length > 0 && !showCreateForm && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-dashboard mb-3">Link one of your other lists</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attachableLists.map((list: any) => (
                  <div key={list.documentId} className="flex flex-col gap-2">
                    <SelectProductListCard
                      list={list}
                      onSelect={() => handleAttach(list.documentId)}
                    />
                    <button
                      type="button"
                      onClick={() => handleAttach(list.documentId)}
                      disabled={commands.loading}
                      className="self-end text-xs text-dashboard-accent hover:opacity-80 transition-opacity disabled:opacity-60"
                    >
                      Link to this location
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          {(linkedLists.length > 0 || attachableLists.length > 0) && !showCreateForm && (
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-dashboard-muted">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          )}

          {/* Create new list */}
          <AnimatePresence>
            {showCreateForm ? (
              <CreateLinkedProductListForm
                locationId={locationId!}
                locationName={location?.List_Name || "this location"}
                username={username}
                onCreated={handleListCreated}
                onCancel={() => setShowCreateForm(false)}
              />
            ) : (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowCreateForm(true)}
                className="w-full border-2 border-dashed border-dashboard-border hover:border-dashboard-accent rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-dashboard-muted hover:text-white transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-900/20 border border-orange-800/30 group-hover:bg-orange-900/30 flex items-center justify-center transition-colors">
                  <Plus size={22} className="text-orange-400" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm">Create a New Product List</p>
                  <p className="text-xs mt-0.5 text-dashboard-muted">It will be linked to this location automatically</p>
                </div>
              </motion.button>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

export default AddLinkedProductsPage;
