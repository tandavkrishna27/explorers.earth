import {describe,it,expect,vi} from 'vitest';
import {PostgresPublicProfileGateway} from '../../publicProfile/postgresPublicProfileGateway';
describe('canonical Books compatibility gateway',()=>{
 it('queries public Books instead of returning fake complete empty content',async()=>{
  const query=vi.fn(async()=>({rows:[]}));const release=vi.fn();const db={query,connect:vi.fn(async()=>({query,release}))};
  const gateway=new PostgresPublicProfileGateway(db as never);
  expect(await gateway.resolveCategory('owner','books',12)).toBeUndefined();
  expect(query.mock.calls.length).toBeGreaterThan(0);
 });
});
