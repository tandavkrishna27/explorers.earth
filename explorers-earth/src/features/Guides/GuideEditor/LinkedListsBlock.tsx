import {useTranslation} from 'react-i18next';
import type {LinkedListCard} from '../../../../../tunes/shared/explorersListLinkContract';
/** LNK-08 shell: read-only on Plan. Attach/Detach live in Manage (WP10). Empty until WP10 feeds links. */
export default function LinkedListsBlock({links, onOpen}: {links: LinkedListCard[]; onOpen: (card: LinkedListCard) => void}) {
 const {t} = useTranslation();
 if (links.length === 0) return null;
 return (
  <section className="mt-8">
   <h3 className="mb-2 font-semibold">{t('dashboard.wp9.linkedLists', {defaultValue: 'Linked lists'})}</h3>
   <ul className="grid gap-2 sm:grid-cols-2">{links.map((card) => (
    <li key={card.linkId} className="flex items-center gap-3 rounded-lg border p-3">
     <div className="min-w-0 flex-1">
      {card.role && <p className="text-xs text-gray-500">{card.role}</p>}
      <p className="truncate font-medium" title={card.collection.title}>{card.collection.title}</p>
     </div>
     <button type="button" onClick={() => onOpen(card)} aria-label={t('dashboard.wp9.openList', {defaultValue: 'Open {{title}}', title: card.collection.title})}
      className="min-h-[44px] rounded-lg border px-3 text-sm">{t('dashboard.wp9.open', {defaultValue: 'Open'})}</button>
    </li>))}
   </ul>
  </section>
 );
}
