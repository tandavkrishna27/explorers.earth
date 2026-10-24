import { useContext, useState } from "react";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import useAuthStore from "../../../store/store";
import NewListDialog, { type NewListCreate } from "../lists/NewListDialog";
import type { CategoryKey } from "../category/categoryConfig";
import { LinkedListsSection } from "./LinkedListsSection";
import { LinkedListsPanel, type LinkToast } from "./LinkedListsPanel";
import { AttachListPicker } from "./AttachListPicker";
import { LIST_LINKS_KEY, useAllMyLists, useListLinkState, useListLinks } from "./useListLinks";

/**
 * WP10 mounting points. Each reads the list's own editable detail, so a page only has to
 * know the list id. Both render nothing outside a QueryClientProvider (isolated tests of
 * the host page) and while the read is loading or failed: linking never blocks the page.
 */
function useHasQueryClient() { return useContext(QueryClientContext) !== undefined; }

/** LNK-03/05. The "Linked lists" section under a list's items. */
export function LinkedListsUnderItems({ collectionId, originLabel, readOnly }: { collectionId: string | null | undefined; originLabel?: string; readOnly?: boolean }) {
  if (!useHasQueryClient() || !collectionId) return null;
  return <UnderItems collectionId={collectionId} originLabel={originLabel} readOnly={readOnly} />;
}
function UnderItems({ collectionId, originLabel, readOnly }: { collectionId: string; originLabel?: string; readOnly?: boolean }) {
  const state = useListLinkState(collectionId).data;
  return state ? <LinkedListsSection linkedLists={state.linkedLists} originLabel={originLabel ?? state.title} readOnly={readOnly} /> : null;
}

export function showLinkToast(note: LinkToast) {
  if (note.error) { toast.error(note.message); return; }
  if (note.actionLabel && note.onAction) toast.success(note.message, { action: { label: note.actionLabel, onClick: note.onAction } });
  else toast.success(note.message);
}

/** LNK-04/06/08, OWN-13. Manage → Linked lists: Attach (picker or create-and-attach), Detach with Undo, roles. */
export function ManageLinkedLists({ collectionId, rolesEnabled }: { collectionId: string | null | undefined; rolesEnabled?: boolean }) {
  if (!useHasQueryClient() || !collectionId) return null;
  return <Manage collectionId={collectionId} rolesEnabled={rolesEnabled} />;
}
function Manage({ collectionId, rolesEnabled }: { collectionId: string; rolesEnabled?: boolean }) {
  const state = useListLinkState(collectionId).data;
  if (!state) return null;
  return <ManageLoaded state={state} rolesEnabled={rolesEnabled ?? state.category === "guides"} />;
}

type LoadedState = NonNullable<ReturnType<typeof useListLinkState>["data"]>;
function ManageLoaded({ state, rolesEnabled }: { state: LoadedState; rolesEnabled: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const username = useAuthStore((s) => s.user?.username ?? "");
  const links = useListLinks({ collectionId: state.id, category: state.category, categoryRevision: state.categoryRevision, linkedLists: state.linkedLists });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState<CategoryKey | null>(null);
  const ownLists = useAllMyLists(pickerOpen);

  const pick = async (list: { id: string; category: string; title: string }) => {
    setPickerOpen(false);
    try {
      await links.attach(list);
      showLinkToast({ message: t("dashboard.wp10.attached", "Attached {{title}}", { title: list.title }) });
    } catch (error) {
      showLinkToast({ message: error instanceof Error && error.message ? error.message : t("dashboard.wp10.attachFailed", "Couldn't attach the list"), error: true });
    }
  };
  // LNK-06. The host's CATEGORY revision is read fresh right before the create, so a create
  // straight after another link command in this tab is not refused as stale.
  const createAndAttach: NewListCreate = async ({ placeLocation, coverMediaId, ...input }) => {
    const host = await explorersApiClient.getMyEditableCollection(state.id);
    return explorersApiClient.createMyCollection({
      ...input, visibility: "private", publicationState: "draft",
      ...(placeLocation === undefined ? {} : { placeLocation }),
      ...(coverMediaId === undefined ? {} : { coverMediaId }),
      attachTo: { hostCollectionId: state.id, expectedHostRevision: Number(host.categoryRevision), role: null },
    }, crypto.randomUUID(), undefined, host);
  };
  return (
    <>
      <LinkedListsPanel linkedLists={state.linkedLists} links={links} onToast={showLinkToast} onAttach={() => setPickerOpen(true)} rolesEnabled={rolesEnabled} />
      <AttachListPicker open={pickerOpen} onOpenChange={setPickerOpen} lists={ownLists} isAttachable={links.isAttachable}
        onPick={(list) => void pick(list)} onCreateNew={(category) => { setPickerOpen(false); setCreating(category); }} />
      {creating && (
        <NewListDialog open category={creating} username={username} onClose={() => setCreating(null)} create={createAndAttach}
          // LNK-06: stay on the origin list; the new list shows up under Linked lists.
          onCreated={() => { setCreating(null); void client.invalidateQueries({ queryKey: [LIST_LINKS_KEY] }); }} />
      )}
    </>
  );
}
