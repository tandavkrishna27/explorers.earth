import { IGDBSearchResult } from "../types/igdbTypes";

export class IgdbError extends Error {
  readonly code='PROVIDER_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = "IgdbError";
  }
}

export interface MappedGame {
  igdb_id: number;
  igdb_slug: string | null;
  title: string;
  cover_url: string | null;
  cover_url_large: string | null;
  igdb_image_id: string | null;
  summary: string | null;
  release_date: string | null;
  release_year: string | null;
  igdb_rating: number | null;
  igdb_rating_count: number | null;
  genres: string[];
  platforms: string[];
  developer: string | null;
  publisher: string | null;
  game_modes: string[];
  screenshot_ids: string[];
  igdb_url: string | null;
}

class IgdbService {
  public formatIgdbRating(rating: number | null | undefined): string | null {
    if (rating == null || !Number.isFinite(rating) || rating < 0 || rating > 100) return null;
    return (rating / 10).toFixed(1);
  }

  public shortenPlatform(name: string): string {
    const map: Record<string, string> = {
      "PC (Microsoft Windows)": "PC",
      "PlayStation 5": "PS5",
      "PlayStation 4": "PS4",
      "PlayStation 3": "PS3",
      "Xbox Series X|S": "Xbox Series",
      "Xbox One": "Xbox One",
      "Nintendo Switch": "Switch",
    };
    return map[name] || name;
  }

  public extractDeveloper(involvedCompanies: IGDBSearchResult["involved_companies"]): string | null {
    if (!involvedCompanies) return null;
    const dev = involvedCompanies.find(c => c.developer);
    return dev ? dev.company.name : null;
  }

  public extractPublisher(involvedCompanies: IGDBSearchResult["involved_companies"]): string | null {
    if (!involvedCompanies) return null;
    const pub = involvedCompanies.find(c => c.publisher);
    return pub ? pub.company.name : null;
  }

  public igdbTimestampToYear(timestamp: number | null | undefined): string | null {
    if (timestamp == null || !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp * 1000).getTime())) return null;
    return new Date(timestamp * 1000).getUTCFullYear().toString();
  }

  public igdbTimestampToDateString(timestamp: number | null | undefined): string | null {
    if (timestamp == null || !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp * 1000).getTime())) return null;
    return new Date(timestamp * 1000).toISOString().split('T')[0];
  }

  public getCoverUrl(imageId: string | null | undefined, size: string = 'cover_big'): string | null {
    if (!imageId || !/^[A-Za-z0-9_]{1,128}$/.test(imageId) || !['cover_small','cover_big','720p','1080p','screenshot_med','screenshot_big','thumb','micro'].includes(size)) return null;
    return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
  }

  public getScreenshotUrl(imageId: string | null | undefined, size: string = '720p'): string | null {
    if (!imageId || !/^[A-Za-z0-9_]{1,128}$/.test(imageId) || !['cover_small','cover_big','720p','1080p','screenshot_med','screenshot_big','thumb','micro'].includes(size)) return null;
    return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
  }

  public async searchGames(_query: string, _limit=10): Promise<never> { throw new IgdbError('Games provider is unavailable.'); }
  public async getGameDetails(_id: number): Promise<never> { throw new IgdbError('Games provider is unavailable.'); }
  public transformIgdbResult(item: IGDBSearchResult): MappedGame {
    const rawRatingStr = this.formatIgdbRating(item.total_rating);
    const parsedRating = rawRatingStr ? parseFloat(rawRatingStr) : null;
    
    return {
      igdb_id: item.id,
      igdb_slug: item.slug || null,
      title: item.name,
      cover_url: this.getCoverUrl(item.cover?.image_id, 'cover_big'),
      cover_url_large: this.getCoverUrl(item.cover?.image_id, '1080p'),
      igdb_image_id: item.cover?.image_id || null,
      summary: item.summary || null,
      release_date: this.igdbTimestampToDateString(item.first_release_date),
      release_year: this.igdbTimestampToYear(item.first_release_date),
      igdb_rating: parsedRating,
      igdb_rating_count: item.total_rating_count ?? null,
      genres: item.genres?.map(g => g.name) || [],
      platforms: item.platforms?.map(p => this.shortenPlatform(p.name)) || [],
      developer: this.extractDeveloper(item.involved_companies),
      publisher: this.extractPublisher(item.involved_companies),
      game_modes: item.game_modes?.map(g => g.name) || [],
      screenshot_ids: item.screenshots?.map(s => s.image_id) || [],
      igdb_url: item.url || null,
    };
  }
}

const igdbService = new IgdbService();
export default igdbService;
