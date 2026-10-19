'use client';
import { renderEntryLinkEditor } from './render-entry-link-editor';
import type { TrackingContentContext } from './tracking-content-context';
export function renderEntryLinks(context: TrackingContentContext) {
  const {
    advanced,
    editingEntryLinkId,
    editingEntryLinkName,
    setEditingEntryLinkName,
    editingEntryDestination,
    setEditingEntryDestination,
    editingEntryTrafficSource,
    setEditingEntryTrafficSource,
    updateEntryLink,
    setEditingEntryLinkId,
    convertingEntryLinkId,
    entryAbName,
    setEntryAbName,
    entryAbDestinationA,
    setEntryAbDestinationA,
    entryAbDestinationB,
    setEntryAbDestinationB,
    entryAbTrafficA,
    setEntryAbTrafficA,
    convertEntryLinkToAb,
    setConvertingEntryLinkId,
    canManage,
    removeEntryLink,
  } = context;
  return (
    <div className="mt-4 space-y-3">
      {(advanced.data?.entry_links ?? []).map((link) =>
        renderEntryLinkEditor({
          link,
          editingEntryLinkId,
          editingEntryLinkName,
          setEditingEntryLinkName,
          editingEntryDestination,
          setEditingEntryDestination,
          editingEntryTrafficSource,
          setEditingEntryTrafficSource,
          updateEntryLink,
          setEditingEntryLinkId,
          convertingEntryLinkId,
          entryAbName,
          setEntryAbName,
          entryAbDestinationA,
          setEntryAbDestinationA,
          entryAbDestinationB,
          setEntryAbDestinationB,
          entryAbTrafficA,
          setEntryAbTrafficA,
          convertEntryLinkToAb,
          setConvertingEntryLinkId,
          canManage,
          removeEntryLink,
        }),
      )}
    </div>
  );
}
