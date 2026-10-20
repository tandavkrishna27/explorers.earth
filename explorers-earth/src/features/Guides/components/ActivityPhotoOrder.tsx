import ReorderableMediaStrip from "../../../components/reorder/ReorderableMediaStrip";

interface Photo { id: string | number; url: string }

/** Arranges one activity's photos; the first is the thumbnail and the lead image in the viewer. */
export default function ActivityPhotoOrder<P extends Photo>({ name, photos, onChange }: { name: string; photos: P[]; onChange: (next: P[]) => void }) {
  if (photos.length < 2) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-dashboard-light font-poppins">Order photos</summary>
      <div className="mt-2">
        <ReorderableMediaStrip
          items={photos.map((photo) => ({ id: String(photo.id), url: photo.url }))}
          noun={`${name} photo`}
          alt={`${name} photo`}
          removeLabel={`Remove ${name} photo`}
          removable={false}
          onChange={(next) => {
            const byId = new Map(photos.map((photo) => [String(photo.id), photo]));
            onChange(next.flatMap((item) => (byId.has(item.id) ? [byId.get(item.id)!] : [])));
          }}
        />
      </div>
    </details>
  );
}
