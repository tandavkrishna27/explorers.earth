import {GameCatalog} from './gameCatalog';
import {createGameProviderCoordinator} from './gameProviderBudget';
import {createGameProviderTransport} from './gameProviderTransport';
import type {ActorBinding} from './gameCatalogTypes';
import type {Actor} from '../application/actor';
let shared:{clientId:string;clientSecret:string;coordinator:ReturnType<typeof createGameProviderCoordinator>;transport:ReturnType<typeof createGameProviderTransport>}|undefined;
/**
 * The IGDB catalog, or undefined while IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are unset so
 * Games stays manual-only. The Twitch app token and the provider budget live in the
 * coordinator, which every catalog built from the same credentials shares.
 */
export function createGameCatalogFromEnv(env:{IGDB_CLIENT_ID?:string;IGDB_CLIENT_SECRET?:string},authorize:(actor:Actor)=>Promise<ActorBinding>):GameCatalog|undefined{
 const clientId=env.IGDB_CLIENT_ID?.trim(),clientSecret=env.IGDB_CLIENT_SECRET?.trim();
 if(!clientId||!clientSecret)return undefined;
 try{
  if(shared?.clientId!==clientId||shared.clientSecret!==clientSecret){const coordinator=createGameProviderCoordinator({now:Date.now});shared={clientId,clientSecret,coordinator,transport:createGameProviderTransport({coordinator,credentials:{clientId,clientSecret}})};}
  return new GameCatalog({coordinator:shared.coordinator,transport:shared.transport,authorize});
 }
 catch{console.warn('IGDB credentials are malformed; Games search stays unavailable');return undefined;}
}
