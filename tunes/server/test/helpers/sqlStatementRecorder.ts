import {expect} from 'vitest';

/**
 * Structural SQL keys for query mocks, plus a vacuity guard.
 *
 * The failure mode this exists to stop: a mock keyed on a SELECT-list prefix with a
 * silent `{rows:[]}` fallback. Commit 343df2dd inserted one column into the public Places
 * collection SELECT list; the key stopped matching, the branch fell through, the
 * projection returned an empty page, and three assertions passed while exercising
 * nothing for weeks (see server/test/publicProfile/publicPeopleSector.test.ts).
 *
 * Two defences here, the same two that landed there:
 *  1. keys describe STABLE STRUCTURE - `FROM <table> <alias>` plus a discriminating
 *     WHERE fragment, or a `/* statement_marker *\/` comment where production has one -
 *     never a SELECT list, which is the one part of a statement that changes whenever a
 *     column is added;
 *  2. `kind()` records every statement that looked structural and still reached the
 *     fallback, and counts the rows each key actually served, so `assertExercised`
 *     fails loudly instead of letting an empty projection look like a pass.
 *
 * `kind()` also rejects AMBIGUITY: if two keys match one statement the recorder throws
 * rather than letting whichever `else if` happens to come first answer. An over-matching
 * key in an if/else chain is its own hazard - the wrong branch can answer with the right
 * shape - and it is invisible until the two statements need different rows.
 */
export type StatementRules=Record<string,(sql:string)=>boolean>;

/** First line of a statement, collapsed, for a failure message that names the statement without dumping its body. */
export function statementPreview(sql:string):string{return sql.replace(/\s+/g,' ').trim().slice(0,96);}

export class SqlStatementRecorder{
 readonly served:Record<string,number>={};
 readonly rowsServed:Record<string,number>={};
 readonly unmatched:string[]=[];
 constructor(private readonly rules:StatementRules,private readonly structural:(sql:string)=>boolean=()=>false){}
 /**
  * Classify one statement. Returns the matching key, or undefined when nothing matched -
  * and when nothing matched but the statement WAS structural, records it as a vacuity
  * finding rather than letting the caller's `[]` fallback answer silently.
  */
 kind(sql:string):string|undefined{
  const hits=Object.keys(this.rules).filter(key=>this.rules[key](sql));
  if(hits.length>1)throw new Error(`Ambiguous mock SQL keys [${hits.join(', ')}] all match: ${statementPreview(sql)}`);
  if(hits.length===1){this.served[hits[0]]=(this.served[hits[0]]??0)+1;return hits[0];}
  if(this.structural(sql))this.unmatched.push(statementPreview(sql));
  return undefined;
 }
 /** Record the rows a key actually handed back, so a key that matches but serves nothing is still visible. */
 serve<T>(kind:string|undefined,rows:T[]):T[]{if(kind)this.rowsServed[kind]=(this.rowsServed[kind]??0)+rows.length;return rows;}
 /**
  * No structural statement reached the fallback, and each named key was actually reached.
  * Pass `{rows:[...]}` keys to additionally require rows were served, for a path whose
  * assertions would not notice an empty answer.
  */
 assertExercised(kinds:string[]=[],withRows:string[]=[]){
  expect(this.unmatched).toEqual([]);
  for(const kind of [...kinds,...withRows])expect(this.served[kind]??0,`mock key '${kind}' was never reached`).toBeGreaterThan(0);
  for(const kind of withRows)expect(this.rowsServed[kind]??0,`mock key '${kind}' served no rows`).toBeGreaterThan(0);
 }
}

/**
 * The public per-category account scope read, shared verbatim by NINE projection files
 * (`publicAppsProjection` ... `publicProductsProjection`). Keyed on its join structure
 * and its handle predicate: `FROM creator_accounts a`, the category settings join that
 * makes it the public scope rather than any other account read, and
 * `a.handle_key=lower($1)`. None of those move when a column is added to its SELECT list,
 * which is exactly what the old `SELECT a.id,a.handle` prefix key could not survive.
 */
export function isPublicAccountScope(sql:string,category:string):boolean{
 return sql.includes('FROM creator_accounts a')
  &&sql.includes('JOIN account_category_settings s')
  &&sql.includes(`s.category='${category}'`)
  &&sql.includes('a.handle_key=lower($1)');
}

/** Transaction control and session settings are not projections; they never count as vacuity. */
export function isTransactionControl(sql:string):boolean{return /^\s*(BEGIN|COMMIT|ROLLBACK|SET\b)/i.test(sql);}
