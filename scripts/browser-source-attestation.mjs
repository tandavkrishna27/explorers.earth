import { createHash } from 'node:crypto';
import { digest, exactFields, identityKey } from './browser-shard-plan.mjs';
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');

function validPath(path) {
  identityKey({ file: path, titlePath: ['source'], project: '', repeat: 0 });
}

/** Pure attestation over caller-supplied Git blobs and observed files.
 * The collector must independently obtain SHA/blobs/modes/eol policies and lstat
 * actual files; no receipt-supplied expected bytes or checkout policy is trusted.
 */
export function attestSourceTree({ sha, files, trackedPaths, untracked, configPaths, lockPaths }) {
  if (!/^[a-f0-9]{40}$/.test(sha) || !Array.isArray(files) || !files.length || !Array.isArray(untracked)) {
    throw new Error('Missing source tree');
  }
  if (untracked.length) throw new Error('Untracked relevant source');
  const portable = [], observed = [], known = new Set();
  for (const file of files) {
    exactFields(file, ['path','mode','policy','committed','observed','observedKind'], 'source file');
    validPath(file.path);
    if (file.observedKind !== 'file' || known.has(file.path) || !['100644','100755'].includes(file.mode)) throw new Error('Duplicate or unsupported Git mode');
    known.add(file.path);
    if (!(file.committed instanceof Uint8Array) || !(file.observed instanceof Uint8Array)) throw new Error('Source bytes required');
    const committed = Buffer.from(file.committed), tree = Buffer.from(file.observed);
    let expected, comparable = tree;
    if (file.policy === 'exact') {
      expected = committed;
    } else if (file.policy === 'lf' || file.policy === 'crlf' || file.policy === 'git-crlf-to-lf') {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(committed); }
      catch { throw new Error('Invalid UTF8 text blob'); }
      if (text.includes('\0') || text.includes('\r')) throw new Error('Unsupported text blob/eol policy');
      expected = file.policy === 'crlf' ? Buffer.from(text.replaceAll('\n', '\r\n')) : committed;
      if (file.policy === 'git-crlf-to-lf') {
        let observedText;
        try { observedText = new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(tree).replaceAll('\r\n','\n'); } catch { throw new Error('Invalid observed UTF8'); }
        if (observedText.includes('\r') || observedText.includes('\0')) throw new Error('Unsupported observed text');
        comparable = Buffer.from(observedText);
      }
    } else {
      throw new Error('Unsupported checkout policy');
    }
    if (!expected.equals(comparable)) throw new Error(`Dirty relevant source: ${file.path}`);
    portable.push({ path:file.path, mode:file.mode, blobHash:bytesHash(committed) });
    observed.push({ path:file.path, policy:file.policy, byteHash:bytesHash(tree) });
  }
  if (!Array.isArray(trackedPaths) || !trackedPaths.length || new Set(trackedPaths).size !== trackedPaths.length || trackedPaths.length !== known.size || trackedPaths.some(path => !known.has(path))) throw new Error('Observed file inventory differs from trusted tracked inventory');
  portable.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  observed.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  function subset(paths, label) {
    if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length || paths.some(path => !known.has(path))) {
      throw new Error(`Invalid ${label} paths`);
    }
    return portable.filter(file => paths.includes(file.path));
  }
  const provenance = { schemaVersion:2, sha, sourceHash:digest(portable),
    configHash:digest(subset(configPaths, 'config')), lockHash:digest(subset(lockPaths, 'lock')) };
  return { schemaVersion:2, provenance, portable, observed, observedHash:digest(observed), clean:true };
}
