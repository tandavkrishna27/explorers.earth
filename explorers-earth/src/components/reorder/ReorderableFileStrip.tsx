import { useMemo, useRef } from 'react';
import ReorderableMediaStrip, { type MediaStripItem } from './ReorderableMediaStrip';

interface Props {
  /** Files chosen but not yet uploaded; they upload, in this order, when the form is saved. */
  files: File[];
  /** Object URLs for `files`, by index. May briefly lag behind `files` by a render. */
  previews: ReadonlyArray<string | undefined>;
  /** Which previews are videos, by index; everything else is an image. */
  kinds?: ReadonlyArray<'image' | 'video' | undefined>;
  onChange: (files: File[]) => void;
  noun: string;
  alt: string;
  removeLabel: string;
  disabled?: boolean;
}

/** The same strip for files that have not been uploaded yet, keyed by file identity. */
export default function ReorderableFileStrip({ files, previews, kinds, onChange, noun, alt, removeLabel, disabled }: Props) {
  const ids = useRef(new WeakMap<File, string>());
  const counter = useRef(0);
  const idOf = (file: File) => {
    let id = ids.current.get(file);
    if (!id) { id = `file-${++counter.current}`; ids.current.set(file, id); }
    return id;
  };
  const items = useMemo<MediaStripItem[]>(() => files.map((file, index) => ({ id: idOf(file), url: previews[index] ?? '', kind: kinds?.[index] })), [files, previews, kinds]);
  return (
    <ReorderableMediaStrip
      items={items}
      noun={noun}
      alt={alt}
      removeLabel={removeLabel}
      disabled={disabled}
      onChange={(next) => {
        const byId = new Map(files.map((file) => [idOf(file), file]));
        onChange(next.flatMap((item) => (byId.has(item.id) ? [byId.get(item.id)!] : [])));
      }}
    />
  );
}
