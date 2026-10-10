import {Router,type Express,type RouterOptions} from 'express';
import {METHODS} from 'node:http';
type Evidence=Readonly<{status:'settled'|'failed-but-settled'|'unsettled';sealed:boolean;requests:number;frames:number;uncertain:boolean;unknown:boolean}>;
type Frame={returned:boolean;transition:boolean;promise:boolean;done:boolean};
type RecordState={req:any;res:any;frames:Set<Frame>;invoked:number;finished:boolean;input:boolean;closed:boolean};
/** Construction-only registration view. Returned product app/Router methods stay intact. */
export function createCanonicalHandlerCustody(app:Express){
 let sealed=false,uncertain=false,unknown=false,total=0,constructionClosed=false;const uncovered=new WeakSet<Function>(),requests=new Set<RecordState>(),records=new WeakMap<object,RecordState>(),views=new WeakMap<object,any>(),listeners=new Set<()=>void>(),targets:{target:any;prototype:any;methods:Map<string,Function>}[]=[];let registrationShape:any[]|undefined;
 function shape(){
  const result:any[]=[];const seen=new Set<object>();
  const map=(value:any)=>{result.push(value,Object.getPrototypeOf(value));const keys=Object.keys(value).sort();result.push(keys.length,...keys);for(const key of keys){const entry=value[key];result.push(entry);if(Array.isArray(entry))result.push(entry.length,...entry);}};
  const stack=(layers:any[])=>{result.push(layers,layers.length);for(const layer of layers){
   result.push(layer,Object.getPrototypeOf(layer),layer.handle,layer.match,layer.handleRequest,layer.handleError,layer.slash,layer.method,layer.matchers);
   if(Array.isArray(layer.matchers))result.push(layer.matchers.length,...layer.matchers);
   if(layer.route){const route=layer.route;result.push(route,Object.getPrototypeOf(route),route.dispatch,route._handlesMethod,route._methods,JSON.stringify(route.path));map(route.methods);stack(route.stack);}
   else if(layer.handle?.stack)router(layer.handle);
  }};
  const router=(value:any)=>{result.push(value);if(seen.has(value))return;seen.add(value);result.push(Object.getPrototypeOf(value),value.handle,value.mergeParams);map(value.params);stack(value.stack);};
  result.push((app as any).handle);const root=(app as any)._router??(app as any).router;if(root)router(root);return result;
 }
 function attest(){for(const item of targets)if(Object.getPrototypeOf(item.target)!==item.prototype||[...item.methods].some(([name,fn])=>item.target[name]!==fn)){uncertain=true;return false;}if(registrationShape){const now=shape();if(now.length!==registrationShape.length||now.some((value,index)=>value!==registrationShape![index])){uncertain=true;return false;}}return true;}
 const signal=()=>{for(const listener of listeners)listener();};
 const snapshot=():Evidence=>{attest();return Object.freeze({status:requests.size||unknown?'unsettled':uncertain?'failed-but-settled':sealed?'settled':'unsettled',sealed,requests:requests.size,frames:[...requests].reduce((n,r)=>n+r.frames.size,0),uncertain,unknown});};
 function check(r:RecordState){for(const f of r.frames)if(f.returned&&(f.done||!f.promise&&(f.transition||r.finished&&r.input))){r.frames.delete(f);}if(r.finished&&r.input&&!r.frames.size){requests.delete(r);r.closed=true;}signal();}
 function admit(req:any,res:any){if(!attest())return undefined;const prior=records.get(req);if(prior){if(prior.closed){uncertain=true;signal();return undefined;}return prior;}if(sealed||requests.size>=128||total>=4096){uncertain=true;signal();return undefined;}
  const r:RecordState={req,res,frames:new Set(),invoked:0,finished:false,input:req.complete===true||req.readableEnded===true,closed:false};total++;requests.add(r);records.set(req,r);
  req.once('end',()=>{r.input=(req.complete===true||req.readableEnded===true)&&!req.aborted;check(r);});req.once('aborted',()=>{uncertain=true;check(r);});req.once('error',()=>{uncertain=true;check(r);});res.once('finish',()=>{r.finished=true;r.input=r.input||((req.complete===true||req.readableEnded===true)&&!req.aborted);check(r);});res.once('close',()=>{if(!r.finished){uncertain=true;check(r);}});
  if(req.aborted)uncertain=true;return r;
 }
 function invoke(original:Function,receiver:any,args:any[],errorHandler:boolean){const req=args[errorHandler?1:0],res=args[errorHandler?2:1],next=args[errorHandler?3:2],r=admit(req,res);if(!r||r.invoked>=64){uncertain=true;res.statusCode=503;res.end();return;}r.invoked++;if(uncovered.has(original)){unknown=true;uncertain=true;}
  const frame:Frame={returned:false,transition:false,promise:false,done:false};r.frames.add(frame);let calls=0;
  const transition=(...values:any[])=>{if(++calls>1||r.closed){uncertain=true;signal();return;}frame.transition=true;try{return next(...values);}finally{check(r);}};
  const actual=[...args];actual[errorHandler?3:2]=transition;
  try{const value=original.apply(receiver,actual);if(value&&(typeof value==='object'||typeof value==='function')){let then:any;try{then=value.then;}catch{frame.promise=true;uncertain=true;return value;}if(typeof then==='function'){frame.promise=true;if(!(value instanceof Promise)){uncertain=true;unknown=true;}try{then.call(value,()=>{frame.done=true;check(r);},()=>{frame.done=true;uncertain=true;check(r);});}catch{uncertain=true;}}}return value;}catch(error){frame.done=true;uncertain=true;throw error;}finally{frame.returned=true;check(r);}
 }
 function wrap(fn:Function){if(views.has(fn))return views.get(fn);return fn.length===4?function(this:any,error:any,req:any,res:any,next:any){return invoke(fn,this,[error,req,res,next],true);}:function(this:any,req:any,res:any,next:any){return invoke(fn,this,[req,res,next],false);};}
 const methods=new Set(['use','all',...METHODS.map(method=>method.toLowerCase())]);
 function registration(target:any){const view=Object.create(target),item={target,prototype:Object.getPrototypeOf(target),methods:new Map<string,Function>()};targets.push(item);views.set(view,target);for(const method of methods)if(typeof target[method]==='function'){const original=target[method],bound=original.bind(target);item.methods.set(method,original);Object.defineProperty(view,method,{value:function(...args:any[]){if(!attest()||constructionClosed){uncertain=true;throw Error('Canonical registration refused');}if(method==='get'&&args.length===1)return bound(...args);const map=(value:any):any=>value&&views.has(value)?views.get(value):Array.isArray(value)?value.map(map):typeof value==='function'?wrap(value):value;bound(...args.map(map));return view;}});}for(const name of ['route','param']){if(typeof target[name]==='function')item.methods.set(name,target[name]);Object.defineProperty(view,name,{value:()=>{uncertain=true;throw Error('Unsupported canonical registration');}});}return view;}
 const custody=Object.freeze({snapshot,admit:(req:any,res:any)=>!!admit(req,res),sealAndDrain:async(milliseconds:number)=>{if(!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>15000)throw Error('Invalid canonical custody budget');attest();sealed=true;if(requests.size)await new Promise<void>(done=>{let timer:ReturnType<typeof setTimeout>;const changed=()=>{if(!requests.size){clearTimeout(timer);listeners.delete(changed);done();}};listeners.add(changed);timer=setTimeout(()=>{uncertain=true;listeners.delete(changed);done();},milliseconds);changed();});return snapshot();}});
 return {registration:registration(app) as Express,routerFactory:(options?:RouterOptions)=>registration(Router(options)) as ReturnType<typeof Router>,markUncovered:(handler:Function)=>{if(constructionClosed)throw Error('Canonical registration refused');uncovered.add(handler);},completeRegistration:()=>{attest();registrationShape=shape();constructionClosed=true;},custody};
}
