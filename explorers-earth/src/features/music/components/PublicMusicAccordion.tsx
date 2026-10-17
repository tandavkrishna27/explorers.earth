import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, Headphones, History, ListMusic, ListOrdered } from 'lucide-react';
import type { ReactNode } from 'react';
export type MusicAccordionId = 'queue' | 'history' | 'playlists' | 'player';
export interface PublicMusicAccordionProps { id: MusicAccordionId; title: string; open: boolean; onOpenChange(open: boolean): void; children: ReactNode }
const icons = { queue: ListOrdered, history: History, playlists: ListMusic, player: Headphones };
export function PublicMusicAccordion({ id, title, open, onOpenChange, children }: PublicMusicAccordionProps) {
  const Icon = icons[id];
  return <Accordion.Root type="single" collapsible value={open ? id : ''} onValueChange={value => onOpenChange(value === id)}>
    <Accordion.Item value={id} className="public-music__surface public-music__accordion">
      <Accordion.Header asChild><h2><Accordion.Trigger className="public-music__accordion-trigger" aria-label={title}>
        <span className="public-music__section-icon"><Icon aria-hidden="true" size={18} /></span><span>{title}</span><ChevronDown aria-hidden="true" className="public-music__chevron" size={18} />
      </Accordion.Trigger></h2></Accordion.Header>
      <Accordion.Content className="public-music__accordion-content">{children}</Accordion.Content>
    </Accordion.Item>
  </Accordion.Root>;
}
