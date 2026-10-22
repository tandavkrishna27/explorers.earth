/**
 * LP-09. A public list URL matches the list's current slug or a slug it was renamed from.
 * The repository keeps one live owner per old slug (create refuses it, rename onto it
 * releases it), so at most one live list matches. `alias` is the collections alias in the
 * caller's query and `param` its slug placeholder, e.g. listSlugPredicate('c','$2').
 */
export const listSlugPredicate=(alias:string,param:string)=>
  `(${alias}.slug=${param} OR ${alias}.id=(SELECT r.collection_id FROM collection_slug_redirects r WHERE r.account_id=${alias}.account_id AND r.category=${alias}.category AND r.old_slug=${param}))`;
