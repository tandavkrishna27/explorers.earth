import { memo } from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { subjectToSlug } from "../../utils/bookHelpers";

interface SubjectBrowseProps {
  subjects: string[];
  username: string;
}

const SubjectBrowse = memo(({ subjects, username }: SubjectBrowseProps) => {
  if (subjects.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-[22px] bg-amber-400 rounded-sm flex-shrink-0" />
        <h2 className="text-xl font-bold text-[color:var(--category-text,#fff)] flex items-center gap-2">
          <BookOpen size={18} className="text-[color:var(--category-text,#fbbf24)]" /> Browse by Subject
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {subjects.slice(0, 30).map((subject) => (
          <Link
            key={subject}
            to={`/${username}/books/subject/${subjectToSlug(subject)}`}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--category-card,rgba(255,255,255,0.08))] text-[color:var(--category-muted,rgba(255,255,255,0.7))] hover:bg-amber-400/20 hover:text-[color:var(--category-text,#fcd34d)] border border-[color:var(--category-border,rgba(255,255,255,0.1))] hover:border-[color:var(--category-focus,rgba(251,191,36,0.3))] transition-all"
          >
            {subject}
          </Link>
        ))}
      </div>
    </section>
  );
});

SubjectBrowse.displayName = "SubjectBrowse";
export default SubjectBrowse;
