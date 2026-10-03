import {attestSourceTree} from './browser-source-attestation.mjs';
import {canonical,exactFields,identityKey} from './browser-shard-plan.mjs';
const admitted=path=>['explorers-earth/src/','explorers-earth/e2e/','explorers-earth/scripts/','tunes/shared/'].some(prefix=>path.startsWith(prefix))||/^explorers-earth\/[^/]+\.config\.ts$/.test(path)||['explorers-earth/package.json','explorers-earth/package-lock.json','tunes/package.json','tunes/package-lock.json'].includes(path);
const checkedPath=path=>identityKey({file:path,titlePath:['source'],project:'',repeat:0});
/** Repository paths and parsed closure come from an independent Git/AST collector.
 * This conservative scope admits all frontend scripts, including ignored helpers:
 * the caller must report actual untracked/ignored relevant files in source.untracked.
 */
export function discoverySourcePaths(repositoryPaths){
 if(!Array.isArray(repositoryPaths)||!repositoryPaths.length||new Set(repositoryPaths).size!==repositoryPaths.length)throw Error('Invalid trusted repository inventory');
 repositoryPaths.forEach(checkedPath);
 return repositoryPaths.filter(admitted).sort();
}
export function attestDiscoverySource({repositoryPaths,source,closure}){
 const expected=discoverySourcePaths(repositoryPaths);
 if(canonical([...source.trackedPaths].sort())!==canonical(expected))throw Error('Incomplete discovery source scope');
 exactFields(closure,['roots','edges'],'closure');
 if(!Array.isArray(closure.roots)||!closure.roots.length||new Set(closure.roots).size!==closure.roots.length||!Array.isArray(closure.edges))throw Error('Invalid discovery closure');
 const known=new Set(expected),reached=new Set(closure.roots),edgeKeys=new Set();
 for(const path of closure.roots){checkedPath(path);if(!known.has(path))throw Error('Missing closure root');}
 for(const edge of closure.edges){exactFields(edge,['from','to'],'import edge');checkedPath(edge.from);checkedPath(edge.to);const key=canonical(edge);if(edgeKeys.has(key)||!known.has(edge.from)||!known.has(edge.to))throw Error('Unadmitted or duplicate import edge');edgeKeys.add(key);}
 let changed=true;while(changed){changed=false;for(const edge of closure.edges)if(reached.has(edge.from)&&!reached.has(edge.to)){reached.add(edge.to);changed=true;}}
 if(closure.edges.some(edge=>!reached.has(edge.from)))throw Error('Unreachable import edge');
 return attestSourceTree(source);
}
