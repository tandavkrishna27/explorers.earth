// Historical generator retained below for provenance, disabled to protect amendments.
// Individual tickets are authoritative; only read-only custody checks are supported.
{
 const fs = require('node:fs'), path = require('node:path');
 if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Only --check is supported; regeneration is disabled.');
 const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'execution-packages-2026-10-05.json'), 'utf8'));
 const rows = new Map(plan.tickets.map(row => [row.id, row]));
 if (rows.size !== 38 || plan.tickets.length !== 38) throw new Error('Expected 38 unique tickets.');
 const active = new Set(), visited = new Set();
 function visit(id) {
  if (!rows.has(id)) throw new Error(`Unknown prerequisite ${id}`);
  if (active.has(id)) throw new Error(`Dependency cycle at ${id}`);
  if (visited.has(id)) return;
  active.add(id); for (const dependency of rows.get(id).after) visit(dependency);
  active.delete(id); visited.add(id);
 }
 const completed = ['1.1','1.2','1.3','1.4','2.1','2.2','2.3'];
 for (const row of rows.values()) {
  visit(row.id);
  if ((row.state === 'complete') !== completed.includes(row.id)) throw new Error(`Completion drift: ${row.id}`);
  const body = fs.readFileSync(path.join(__dirname, 'tickets', `ticket-${row.id.replace('.', '-')}.md`), 'utf8');
  if (!body.startsWith(`# Ticket ${row.id}:`) || !body.includes('## Current execution card') || !body.includes(row.next) || !body.includes('- [ ]')) throw new Error(`Missing contract/card: ${row.id}`);
 }
 for (let n = 1; n <= 10; n++) {
  const body = fs.readFileSync(path.join(__dirname, 'epics', `epic-${String(n).padStart(2, '0')}.md`), 'utf8');
  if (!body.includes('## Current execution authority')) throw new Error(`Missing epic authority ${n}`);
 }
 console.log('HISTORICAL CHECK ONLY; current dispatch uses schema-v2 execution-packages.json. PASS: 38 ticket contracts/cards, 10 epic authorities, acyclic package prerequisites, 7 preserved completed tickets. Read-only; independent review is a separate gate.');
 process.exit(0);
}
// Disabled historical implementation follows; never run it to regenerate current plans.
const fs=require('node:fs'),path=require('node:path');
const base=__dirname,out=path.join(base,'epics');fs.mkdirSync(out,{recursive:true});
const read=name=>fs.readFileSync(path.join(base,name),'utf8');
const fixLinks=s=>s.replace(/\]\(([^)]+)\)/g,(all,target)=>/^(https?:|#|\/)/.test(target)?all:`](../${target})`);
const write=(number,title,common,body)=>{
 let text=`# Epic ${number}: ${title}\n\n**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)\n\n`;
 text+=fixLinks(common.replace(/^# .*\n/,''))+'\n'+fixLinks(body);
 fs.writeFileSync(path.join(out,`epic-${String(number).padStart(2,'0')}.md`),text);
};
const ops=read('implementation-operations.md');
const opsCommon=ops.slice(0,ops.indexOf('## Ticket 1.1'));
const opsTail=ops.slice(ops.indexOf('## Test lanes and honest reporting'));
const qa=ops.slice(ops.indexOf('## Ticket 3.5'),ops.indexOf('## Ticket 8.1'));
write(1,'Local development and safe CI',opsCommon,ops.slice(ops.indexOf('## Ticket 1.1'),ops.indexOf('## Ticket 3.5'))+'\n'+opsTail);
write(8,'Retirement and production readiness',opsCommon,ops.slice(ops.indexOf('## Ticket 8.1'),ops.indexOf('## Test lanes and honest reporting'))+'\n'+opsTail);
const plans=[
 ['implementation-backend.md',[2,3,6],['Google identity and accounts','Recommendation core and Books','Music identity and parity']],
 ['implementation-features.md',[4,5,7],['Catalog category parity','Places and Guides','Cross-category completion']],
 ['implementation-chatgpt.md',[9,10],['Public ChatGPT discovery','Linked creator tools and review readiness']]
];
for(const [name,ids,titles]of plans){
 const raw=read(name);const matches=[...raw.matchAll(/^## Epic (\d+).*$/gm)];
 if(matches.length!==ids.length)throw new Error(`Epic headings missing in ${name}`);
 const common=raw.slice(0,matches[0].index);
 for(let i=0;i<matches.length;i++){
  let body=raw.slice(matches[i].index,i+1<matches.length?matches[i+1].index:raw.length);
  if(ids[i]===3){const at=body.indexOf('### 3.5');if(at>=0)body=body.slice(0,at);body+='\n'+qa+'\n'+opsTail;}
  write(ids[i],titles[i],common,body);
 }
}
console.log('Wrote 10 individual epic planning documents.');
const ticketDir=path.join(base,'tickets');fs.mkdirSync(ticketDir,{recursive:true});
let index='# Individual ticket implementation plans\n\nConsult the [durable implementation ledger](../../.superpowers/sdd/epic-01/progress.md) for current status. [Master plan](implementation-plan.md) · [Shared execution checklist](execution-checklist.md). Each ticket links its epic for mandatory shared contracts, safety rules and test-harness prerequisites.\n\n| Ticket | Implementation plan | Epic |\n|---|---|---|\n';
let count=0;
for(const epicFile of fs.readdirSync(out).filter(f=>/^epic-\d+\.md$/.test(f)).sort()){
 const epicPath=path.join(out,epicFile),raw=fs.readFileSync(epicPath,'utf8');
 const headings=[...raw.matchAll(/^(#{2,3}) (?:Ticket )?(\d+\.\d+)\s+(?:—\s*)?(.+)$/gm)];
 let links='\n## Individual ticket files\n\n';
 for(const h of headings){
  const id=h[2],title=h[3],start=h.index+h[0].length;
  const rest=raw.slice(start),next=/^#{1,3} /m.exec(rest);
  const body=rest.slice(0,next?next.index:rest.length).trim();
  if(!body.includes('- [ ]'))throw new Error(`No implementation steps for ${id}`);
  const ticketFile=`ticket-${id.replace('.','-')}.md`;
  const text=`# Ticket ${id}: ${title}\n\n**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.\n\n[Parent epic and shared contracts](../epics/${epicFile}) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)\n\n## Required context\n\nRead the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.\n\n## Implementation and acceptance\n\n${body}\n`;
  fs.writeFileSync(path.join(ticketDir,ticketFile),text);
  index+=`| ${id} | [${title}](tickets/${ticketFile}) | [Epic ${id.split('.')[0]}](epics/${epicFile}) |\n`;
  links+=`- [Ticket ${id}: ${title}](../tickets/${ticketFile})\n`;count++;
 }
 fs.writeFileSync(epicPath,raw+links);
}
if(count!==38)throw new Error(`Expected 38 tickets, got ${count}`);
fs.writeFileSync(path.join(base,'ticket-index.md'),index);
console.log(`Wrote ${count} individual ticket plans and index.`);
