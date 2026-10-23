import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Deterministic generator for the reviewed curated term lists (books, games, apps,
 * products). Editing a list means re-running this script and re-pinning bytes,
 * sha256 and inputHash in curated-taxonomy-reviewed-import.ts.
 * Ids are UUIDv5 under the taxonomy ratification namespace of
 * "explorers.earth/<category>-term/<slug>". Positions follow list order.
 */
const namespace = 'c534822b-86e9-5c40-be1f-f9b3833dab21';

export function uuidv5(name) {
  const ns = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest().subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export const lists = {
  books: [['literary-fiction', 'Literary Fiction'], ['mystery-thriller', 'Mystery & Thriller'], ['science-fiction', 'Science Fiction'], ['fantasy', 'Fantasy'], ['romance', 'Romance'], ['horror', 'Horror'], ['historical-fiction', 'Historical Fiction'], ['young-adult', 'Young Adult'], ['childrens', "Children's"], ['comics-graphic-novels', 'Comics & Graphic Novels'], ['poetry', 'Poetry'], ['classics', 'Classics'], ['biography-memoir', 'Biography & Memoir'], ['history', 'History'], ['science-nature', 'Science & Nature'], ['technology', 'Technology'], ['business-economics', 'Business & Economics'], ['self-help', 'Self-Help'], ['psychology', 'Psychology'], ['philosophy', 'Philosophy'], ['religion-spirituality', 'Religion & Spirituality'], ['politics-society', 'Politics & Society'], ['travel', 'Travel'], ['food-cooking', 'Food & Cooking'], ['health-fitness', 'Health & Fitness'], ['art-design', 'Art & Design']],
  games: [['action', 'Action', [25, 33]], ['adventure', 'Adventure', [31]], ['role-playing', 'Role-playing (RPG)', [12]], ['shooter', 'Shooter', [5]], ['platformer', 'Platformer', [8]], ['puzzle', 'Puzzle', [9]], ['strategy', 'Strategy', [15, 11, 16, 24]], ['simulation', 'Simulation', [13]], ['sports', 'Sports', [14]], ['racing', 'Racing', [10]], ['fighting', 'Fighting', [4]], ['indie', 'Indie', [32]], ['point-and-click', 'Point-and-click', [2]], ['visual-novel', 'Visual Novel', [34]], ['card-board', 'Card & Board', [35]], ['moba', 'MOBA', [36]], ['music-rhythm', 'Music & Rhythm', [7]], ['party-trivia', 'Party & Trivia', [26, 30]], ['horror', 'Horror', []], ['family-kids', 'Family & Kids', []]],
  apps: [['productivity', 'Productivity'], ['communication', 'Communication'], ['social', 'Social'], ['design-creativity', 'Design & Creativity'], ['developer-tools', 'Developer Tools'], ['finance', 'Finance'], ['education', 'Education'], ['health-fitness', 'Health & Fitness'], ['travel', 'Travel & Navigation'], ['food-drink', 'Food & Drink'], ['shopping', 'Shopping'], ['entertainment', 'Entertainment'], ['music-audio', 'Music & Audio'], ['photo-video', 'Photo & Video'], ['news-reading', 'News & Reading'], ['utilities', 'Utilities'], ['security-privacy', 'Security & Privacy'], ['ai-assistants', 'AI & Assistants'], ['lifestyle', 'Lifestyle'], ['kids-family', 'Kids & Family']],
  products: [['tech-gadgets', 'Tech & Gadgets'], ['audio', 'Audio'], ['computers', 'Computers & Accessories'], ['phones', 'Phones & Accessories'], ['home-kitchen', 'Home & Kitchen'], ['furniture-decor', 'Furniture & Decor'], ['outdoor', 'Outdoor & Camping'], ['travel-gear', 'Travel Gear'], ['fashion', 'Fashion & Apparel'], ['shoes', 'Shoes'], ['bags', 'Bags & Luggage'], ['beauty', 'Beauty & Personal Care'], ['health-wellness', 'Health & Wellness'], ['fitness-sports', 'Fitness & Sports'], ['books-stationery', 'Books & Stationery'], ['toys-games', 'Toys & Games'], ['baby-kids', 'Baby & Kids'], ['pets', 'Pets'], ['tools-diy', 'Tools & DIY'], ['food-groceries', 'Food & Groceries']],
};

export function build(category) {
  const terms = lists[category].map(([slug, label], position) => ({ id: uuidv5(`explorers.earth/${category}-term/${slug}`), category, slug, parentId: null, position, active: true, labels: { en: label } }));
  const sourceMappings = category === 'games'
    ? lists.games.flatMap(([slug, , ids]) => ids.map((id) => ({ sourceHost: 'api.igdb.com', entityKind: 'genre', documentId: String(id), termId: uuidv5(`explorers.earth/games-term/${slug}`) })))
    : [];
  return { version: 'explorers-taxonomy-import/v1', catalogVersion: 1, category, defaultLocale: 'en', terms, sourceMappings, legacySlugMappings: [] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/taxonomy/reviewed-curated-20261023');
  mkdirSync(out, { recursive: true });
  for (const category of Object.keys(lists)) {
    const bytes = Buffer.from(JSON.stringify(build(category), null, 2) + '\n', 'utf8');
    writeFileSync(join(out, `${category}.json`), bytes);
    console.log(category, bytes.length, createHash('sha256').update(bytes).digest('hex'));
  }
}
