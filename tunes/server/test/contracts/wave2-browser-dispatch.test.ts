import {describe,it,expect} from 'vitest';
import {parseBrowserSuite,assertBrowserEnvironment} from '../../../scripts/lifecycle-browser-guards';
const ack='TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
describe('Wave2 public People and Apps enrichment browser admission',()=>{
 it.each(['public-parity','people','apps-enrichment'])('admits only the exact acknowledged %s family',family=>{
  const args=['--suite',family,'--ack',ack];
  expect(parseBrowserSuite(args)).toBe(family);
  for(const changed of [[...args,'--grep','positive'],[...args,'--suite',family],['--suite',family,'--ack','wrong'],['--ack',ack,'--suite',family]])expect(()=>parseBrowserSuite(changed)).toThrow();
 });
 it.each(['PUBLIC_PARITY_E2E_ORIGIN','PEOPLE_E2E_FIXTURE_PATH','PUBLIC_PARITY_PRIVATE_PIPE','PUBLIC_PARITY_PRIVATE_TOKEN','PUBLIC_PARITY_PRIVATE_EPOCH','people_private_pipe'])('rejects ambient %s custody even when empty',key=>{expect(()=>assertBrowserEnvironment({[key]:''})).toThrow();});
});
