import { Users } from "lucide-react";
import type { PersonList, RecommendedPerson } from "../../types";
import { buildImageUrl } from "../../utils/personHelpers";
import PlatformIcon from "../PlatformIcon";

interface PersonCarouselRowProps {
  list: PersonList;
  onPersonClick: (person: RecommendedPerson) => void;
  onViewAll: () => void;
}

const PersonCarouselRow = ({ list, onPersonClick, onViewAll }: PersonCarouselRowProps) => {
  const people = list.recommended_people;
  if (people.length === 0) return null;

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-[color:var(--category-text,#fff)]">{list.List_Name}</h2>
          {list.list_description && (
            <p className="text-xs text-[color:var(--category-muted,rgba(255,255,255,0.4))] mt-0.5 line-clamp-1">{list.list_description}</p>
          )}
        </div>
        <button
          onClick={onViewAll}
          className="text-xs text-[color:var(--category-text,rgba(167,139,250,0.7))] hover:text-[color:var(--category-text,#a78bfa)] font-medium transition-colors whitespace-nowrap"
        >
          View all →
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {people.map((person) => (
          <button
            key={person.documentId}
            onClick={() => onPersonClick(person)}
            className="flex-shrink-0 w-[110px] flex flex-col items-center gap-2 text-center group"
          >
            {/* Circular avatar */}
            <div className="relative w-20 h-20 rounded-full overflow-hidden bg-[var(--category-card,rgba(255,255,255,0.05))] ring-2 ring-[color:var(--category-border,rgba(255,255,255,0.1))] group-hover:ring-[color:var(--category-focus,rgba(167,139,250,0.5))] transition-all shadow-lg group-hover:scale-105 duration-200">
              {person.avatar_url ? (
                <img src={buildImageUrl(person.avatar_url)} alt={person.full_name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Users size={24} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))]" />
                </div>
              )}
              {person.platform && (
                <div className="absolute bottom-1 right-1 p-1 bg-black/60 rounded-full border border-white/10 flex items-center justify-center shadow-md z-10">
                  <PlatformIcon platform={person.platform} size={10} />
                </div>
              )}
            </div>
            <div className="w-full">
              <p className="text-xs font-semibold text-[color:var(--category-text,#fff)] line-clamp-1">{person.full_name}</p>
              {person.handle && (
                <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.4))] truncate">@{person.handle}</p>
              )}
              {person.headline && (
                <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.3))] line-clamp-1 mt-0.5">{person.headline}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PersonCarouselRow;
