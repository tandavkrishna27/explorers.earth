import {describe,it,expect,vi,beforeEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import {AuthorizationError} from '../../application/authorization';
import {MovieProviderFailure} from '../../services/movieCatalog';
import {RecommendationFailure} from '../../repositories/explorersRecommendationRepository';

const actor=vi.hoisted(()=>({require:vi.fn(),search:vi.fn()}));
vi.mock('../../middleware/explorersPrincipal',async orig=>({...(await orig() as object),requireActor:actor.require}));
vi.mock('../../application/catalog',async orig=>({...(await orig() as object),CatalogService:class{searchMovies=actor.search;}}));
const {setupExplorersCatalogRoutes}=await import('../../routes/explorersCatalogRoutes');

function app(){const a=express();setupExplorersCatalogRoutes(a,{} as any,{} as any,{secret:'x'} as any,{} as any,{} as any);return a;}

describe('movie catalog search errors',()=>{
 beforeEach(()=>{actor.require.mockReset().mockResolvedValue({accountId:'a'});actor.search.mockReset();vi.spyOn(console,'error').mockImplementation(()=>{});});
 it('keeps provider failures as they are',async()=>{
  actor.search.mockRejectedValue(new MovieProviderFailure(429));
  const res=await request(app()).get('/api/explorers/v1/catalog/movies?q=x');
  expect(res.status).toBe(429);expect(res.body.error.code).toBe('PROVIDER_UNAVAILABLE');
 });
 it('reports an unexpected catalog error as unavailable movie details, not an account problem',async()=>{
  actor.search.mockRejectedValue(new Error('socket hang up'));
  const res=await request(app()).get('/api/explorers/v1/catalog/movies?q=x');
  expect(res.status).toBe(503);expect(res.body.error.message).toBe('Movie details are unavailable');
  expect(res.body.error.message).not.toMatch(/account/i);
 });
 it('maps recommendation validation failures to invalid input',async()=>{
  actor.search.mockRejectedValue(new RecommendationFailure(422,'bad query'));
  const res=await request(app()).get('/api/explorers/v1/catalog/movies?q=x');
  expect(res.status).toBe(422);expect(res.body.error.code).toBe('INVALID_INPUT');
 });
 it('still answers actor failures with their own status',async()=>{
  actor.require.mockRejectedValue(new AuthorizationError(401,'UNAUTHENTICATED','Sign in is required'));
  const res=await request(app()).get('/api/explorers/v1/catalog/movies?q=x');
  expect(res.status).toBe(401);expect(res.body.error.code).toBe('UNAUTHENTICATED');
 });
 it('does not blame the account for non-actor errors reaching sendActorError',async()=>{
  actor.require.mockRejectedValue(new Error('db down'));
  const res=await request(app()).get('/api/explorers/v1/catalog/movies?q=x');
  expect(res.status).toBe(503);expect(res.body.error.message).not.toMatch(/account/i);
 });
});
