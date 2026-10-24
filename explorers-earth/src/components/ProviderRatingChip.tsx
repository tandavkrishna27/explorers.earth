/** DS-15: a provider's rating is a small source chip, never drawn on the owner's star scale. */
export default function ProviderRatingChip({source,value}:{source:string;value:number|null|undefined}){
 if(value===null||value===undefined||!Number.isFinite(value))return null;
 const shown=value>=10?Math.round(value).toString():value.toFixed(1);
 return <span className="inline-flex items-center rounded-md border border-[color:var(--category-border,rgba(255,255,255,0.1))] px-2 py-0.5 text-xs text-[color:var(--category-muted,rgba(255,255,255,0.6))]">{`${source} ${shown}`}</span>;
}
