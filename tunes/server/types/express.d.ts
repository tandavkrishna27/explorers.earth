import type { MusicPrincipal } from "../middleware/musicPrincipal";
import type { Actor } from "../application/actor";

declare global {
  namespace Express {
    interface Request {
      musicPrincipal?: MusicPrincipal;
      explorersActor?: Actor;
    }
  }
}

export {};
