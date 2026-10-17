import { useRef, type KeyboardEvent } from "react";
import { ListMusic, Radio } from "lucide-react";
import "./MusicSectionTabs.css";

export type MusicSection = "playlists" | "live";

const sections = [
  { value: "playlists", label: "Playlists", Icon: ListMusic },
  { value: "live", label: "Live", Icon: Radio },
] as const;

export function MusicSectionTabs({ value, onChange }: { value: MusicSection; onChange: (value: MusicSection) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (next: number) => {
    onChange(sections[next].value);
    refs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
    select(next);
  };
  return (
    <div role="tablist" aria-label="Music sections" className="mx-auto grid w-full max-w-2xl grid-cols-2 rounded-xl border border-dashboard bg-dashboard-sidebar p-1">
      {sections.map(({ value: section, label, Icon }, index) => (
        <button
          key={section}
          ref={(node) => { refs.current[index] = node; }}
          role="tab"
          id={`music-section-${section}`}
          aria-controls={`music-section-${section}-panel`}
          aria-selected={value === section}
          tabIndex={value === section ? 0 : -1}
          type="button"
          style={{
            color: value === section ? "var(--dash-accent-text)" : "var(--dash-text)",
            backgroundColor: value === section ? "var(--dash-accent)" : "transparent",
          }}
          onClick={() => onChange(section)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={`music-section-tab flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent ${value === section ? "music-section-tab-selected" : "hover:bg-dashboard-muted"}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />{label}
        </button>
      ))}
    </div>
  );
}
