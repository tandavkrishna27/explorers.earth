import {it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const state=vi.hoisted(()=>({child:undefined as any}));
vi.mock('node:child_process',async original=>({...await original<any>(),spawn:()=>state.child}));
async function launcher(){return await import('../../../scripts/guides-launcher').catch(()=>({}) as any);}
it('owns stdin EPIPE event and callback, retains one finite write failure and positive process close',async()=>{
 const module=await launcher();expect(typeof module.launchGuidesSupervisor).toBe('function');
 const child=state.child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
 const native=module.launchGuidesSupervisor('C:\\pwsh.exe',[],'C:\\repo');
 child.stdin.write=(_bytes:any,callback:any)=>{queueMicrotask(()=>{callback(Error('private callback'));child.stdin.emit('error',Error('private EPIPE'));child.stdin.emit('close');});return false;};
 const first=native.stream.write(Buffer.from('first'));
 await expect(first).rejects.toThrow('GUIDES_LAUNCHER_TRANSPORT_FAILED');
 await expect(native.stream.write(Buffer.from('second'))).rejects.toThrow('GUIDES_LAUNCHER_TRANSPORT_FAILED');
 child.emit('close',1);expect(await native.exited()).toEqual({code:1,closed:true});
});
it('owns early child spawn failure and stderr failure without raw diagnostics',async()=>{
 const module=await launcher();expect(typeof module.launchGuidesSupervisor).toBe('function');
 const child=state.child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
 const native=module.launchGuidesSupervisor('C:\\pwsh.exe',[],'C:\\repo');
 child.emit('error',Error('secret spawn path'));child.stderr.emit('error',Error('secret stderr'));child.stdin.emit('close');
 await expect(native.exited()).rejects.toThrow('GUIDES_LAUNCHER_TRANSPORT_FAILED');
 await expect(native.stream.read()).rejects.toThrow('GUIDES_LAUNCHER_TRANSPORT_FAILED');
});
it('runtime capability check rejects missing explicit executable with finite private-safe error',async()=>{
 const module=await launcher();expect(typeof module.assertGuidesPowerShellRuntime).toBe('function');
 await expect(module.assertGuidesPowerShellRuntime(undefined,'C:\\job.ps1')).rejects.toThrow('GUIDES_RUNTIME_UNSUPPORTED');
});

it('stdin close settles an outstanding write once before the process closes',async()=>{
 const module=await launcher();
 const child=state.child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
 const native=module.launchGuidesSupervisor('C:\\pwsh.exe',[],'C:\\repo');
 let callback:any;child.stdin.write=(_bytes:any,cb:any)=>{callback=cb;return false;};
 const pending=native.stream.write(Buffer.from('pending'));
 child.stdin.emit('close');await expect(pending).rejects.toThrow('GUIDES_LAUNCHER_TRANSPORT_FAILED');
 callback(null);child.stdin.emit('error',Error('private detail'));child.emit('close',1);
 expect(await native.exited()).toEqual({code:1,closed:true});
});
it('stdout EOF is clean until a positive child close and stderr byte overflow is retained',async()=>{
 const module=await launcher();
 const child=state.child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
 const native=module.launchGuidesSupervisor('C:\\pwsh.exe',[],'C:\\repo');
 child.stdout.emit('end');expect(await native.stream.read()).toBeNull();
 child.stderr.emit('data',Buffer.alloc(1024*1024+1));
 await expect(native.stream.write(Buffer.from('blocked'))).rejects.toThrow('GUIDES_LAUNCHER_TRANSPORT_FAILED');
 child.emit('close',1);expect(await native.exited()).toEqual({code:1,closed:true});
});
it('drains buffered final framed proof after orderly stdin and code0 child close before read resumes',async()=>{
 const module=await launcher();
 const child=state.child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
 const native=module.launchGuidesSupervisor('C:\\pwsh.exe',[],'C:\\repo');
 const body=Buffer.from(JSON.stringify({v:1,seq:1,id:'a'.repeat(32),type:'exit-ack',payload:{handlesClosed:true}}));
 const header=Buffer.alloc(4);header.writeUInt32BE(body.length);const frame=Buffer.concat([header,body]);
 const reading=native.stream.read();
 child.stdout.emit('data',frame);child.stdout.emit('end');child.stdin.emit('close');child.emit('close',0);
 expect(await reading).toEqual(frame);expect(await native.stream.read()).toBeNull();
 expect(await native.exited()).toEqual({code:0,closed:true});
 await expect(native.stream.write(Buffer.from('late'))).rejects.toThrow('GUIDES_LAUNCHER_TRANSPORT_FAILED');
});
