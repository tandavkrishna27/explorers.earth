import { canonical, checkedIdentities, identityKey } from './browser-shard-plan.mjs';

function selectorPart(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || /[›>\r\n\[\]]/.test(value)) {
    throw new Error(`${label} cannot be represented by Playwright test-list`);
  }
  return value;
}

/** Initial executor contract supports repeatEach=1 only: JSON has no repeat index. */
export function encodeTestList(assigned, { configRoot }) {
  identityKey({ file: `${configRoot}/probe`, titlePath: ['probe'], project: '', repeat: 0 });
  const identities = checkedIdentities(assigned);
  const lines = new Set();
  for (const identity of identities) {
    if (identity.repeat !== 0 || !identity.file.startsWith(`${configRoot}/`)) {
      throw new Error('Unsupported repeat or file outside config root');
    }
    for (const other of identities) {
      if (identity === other || identity.file !== other.file || identity.project !== other.project) continue;
      if (identity.titlePath.length < other.titlePath.length && identity.titlePath.every((title, i) => title === other.titlePath[i])) {
        throw new Error('Title prefix selects additional identities');
      }
    }
    const file = selectorPart(identity.file.slice(configRoot.length + 1), 'file');
    const project = selectorPart(identity.project, 'project');
    const titles = identity.titlePath.map(title => selectorPart(title, 'title'));
    const line = `[${project}] › ${file} › ${titles.join(' › ')}`;
    if (lines.has(line)) throw new Error('Ambiguous selector');
    lines.add(line);
  }
  return [...lines].join('\n') + '\n';
}

export function validateSelectedIdentities(assigned, selected) {
  if (canonical(checkedIdentities(assigned)) !== canonical(checkedIdentities(selected))) {
    throw new Error('Selected identities differ from assigned identities');
  }
  return true;
}
