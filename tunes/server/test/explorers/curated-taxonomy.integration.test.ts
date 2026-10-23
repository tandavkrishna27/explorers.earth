import pg from 'pg';import {afterAll,beforeAll,expect,it} from 'vitest';

/** 0067 (DS-07): seven catalogs, flat shape for the four new ones, movies configured in place. */
let admin:pg.Pool;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:2});});
afterAll(async()=>{await admin?.end();});

it('0067 adds four unconfigured catalogs and configures movies over its 0037 vocabulary',async()=>{
 const rows=(await admin.query('SELECT category,state,version,default_locale FROM taxonomy_catalogs ORDER BY category')).rows;
 expect(rows.map(r=>r.category)).toEqual(['apps','books','games','movies','people','places','products']);
 for(const c of ['apps','books','games','products'])expect(rows.find(r=>r.category===c)).toMatchObject({state:'UNCONFIGURED',version:'0',default_locale:null});
 expect(rows.find(r=>r.category==='movies')).toMatchObject({state:'CONFIGURED',version:'1',default_locale:'en'});
 // The suite shares one database and other files add fixture movies terms, so count the
 // 0037 vocabulary through its reviewed TMDB mappings (999999 is the suites' fixture genre).
 expect(Number((await admin.query("SELECT count(DISTINCT t.id) n FROM taxonomy_terms t JOIN movie_provider_genre_terms m ON m.term_id=t.id WHERE t.category='movies' AND m.provider_genre_id<>999999")).rows[0].n)).toBe(27);
 expect(Number((await admin.query("SELECT count(*) n FROM taxonomy_terms t WHERE t.category='movies' AND NOT EXISTS(SELECT 1 FROM taxonomy_term_translations x WHERE x.term_id=t.id AND x.locale='en')")).rows[0].n)).toBe(0);
});

it('0067 refuses a parented flat term and a guides catalog',async()=>{
 const db=await admin.connect();
 try{
  await db.query('BEGIN');
  const root=(await db.query("INSERT INTO taxonomy_terms(category,slug,position) VALUES('books','s2-root',0) RETURNING id")).rows[0].id;
  await db.query("INSERT INTO taxonomy_term_translations(term_id,locale,label) VALUES($1,'en','Root')",[root]);
  const child=(await db.query("INSERT INTO taxonomy_terms(category,slug,position,parent_id) VALUES('books','s2-child',1,$1) RETURNING id",[root])).rows[0].id;
  await db.query("INSERT INTO taxonomy_term_translations(term_id,locale,label) VALUES($1,'en','Child')",[child]);
  await expect(db.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(/Unsupported taxonomy hierarchy/);
 }finally{await db.query('ROLLBACK');db.release();}
 await expect(admin.query("INSERT INTO taxonomy_catalogs(category) VALUES('guides')")).rejects.toThrow();
});

it('lock function accepts the new categories and refuses unknown ones',async()=>{
 const db=await admin.connect();
 try{
  await db.query('BEGIN');
  for(const c of ['books','games','apps','products','movies'])await db.query('SELECT lock_explorers_taxonomy_catalog($1)',[c]);
  await expect(db.query("SELECT lock_explorers_taxonomy_catalog('guides')")).rejects.toThrow(/Unsupported taxonomy catalog/);
 }finally{await db.query('ROLLBACK');db.release();}
});
