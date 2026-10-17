import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const mode=process.argv[2];
if(process.argv.length!==3||!['source','dist'].includes(mode))throw new Error('Expected exact decoder build mode source or dist');
const root=new URL('../',import.meta.url);
if(mode==='source')await build({entryPoints:[fileURLToPath(new URL('server/services/appEnrichmentDecoderFields.ts',root))],outfile:fileURLToPath(new URL('server/services/appEnrichmentDecoderFields.generated.mjs',root)),bundle:true,format:'esm',platform:'node',target:'node24'});
else await build({entryPoints:[fileURLToPath(new URL('server/services/appEnrichmentDecoderThread.mjs',root))],outfile:fileURLToPath(new URL('dist/server/appEnrichmentDecoderThread.mjs',root)),bundle:true,format:'esm',platform:'node',target:'node24',packages:'external'});
