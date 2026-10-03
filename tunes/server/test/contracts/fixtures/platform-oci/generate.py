"""Independent deterministic stdlib fixtures. No application/validator imports."""
import base64, copy, gzip, hashlib, io, json, pathlib, tarfile
OUT=pathlib.Path(__file__).parent
# Explicit reviewed fixture revision; no application/validator import.
SCHEMA_VERSION=37
INDEX='application/vnd.oci.image.index.v1+json'
MANIFEST='application/vnd.oci.image.manifest.v1+json'
CONFIG='application/vnd.oci.image.config.v1+json'
LAYER='application/vnd.oci.image.layer.v1.tar+gzip'
def sha(b): return 'sha256:'+hashlib.sha256(b).hexdigest()
def enc(v,pretty=False): return json.dumps(v,ensure_ascii=True,sort_keys=pretty,separators=None if pretty else (',',':'),indent=2 if pretty else None).encode()
def b64(b): return base64.b64encode(b).decode()
def desc(b,kind): return dict(mediaType=kind,size=len(b),digest=sha(b))
stream=io.BytesIO()
with tarfile.open(fileobj=stream,mode='w',format=tarfile.USTAR_FORMAT) as archive:
    info=tarfile.TarInfo('fixture.txt'); payload=b'public independent OCI fixture\n';info.size=len(payload)
    info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0;info.mode=0o644;archive.addfile(info,io.BytesIO(payload))
TAR=stream.getvalue();GZIP=gzip.compress(TAR,mtime=0)
(OUT/'layer.tar').write_bytes(TAR);(OUT/'layer.tar.gz').write_bytes(GZIP)
def graph(role,mode='multi',target=None):
    arches=['amd64','arm64'] if mode=='multi' else ['amd64'];pretty=target in ['pretty','canonical-root']
    pool=[];entries=[];platforms={}
    for arch in arches:
        layers=[] if target=='scratch' else [desc(GZIP,LAYER)]
        diff=[] if target=='scratch' else [sha(TAR)]
        if target=='repeat-layer': layers*=2;diff*=2
        if target=='zstd-syntax': layers[0]['mediaType']='application/vnd.oci.image.layer.v1.tar+zstd'
        cfg=dict(architecture=arch,os='linux',rootfs=dict(type='layers',diff_ids=diff),config=dict(User='1000',Env=['FIXTURE='+('shared' if target=='shared-config' else role)],Cmd=['fixture'],Labels={'fixture':'public'},ExposedPorts={'8080/tcp':{}},Volumes={'/fixture':{}},ArgsEscaped=False),history=[dict(created_by='fixture',empty_layer=False)])
        if target=='variant': cfg['variant']='v1' if arch=='amd64' else 'v8'
        if target=='ordinary-options':
            cfg['created']='2024-01-01T00:00:00Z';cfg['author']='fixture'
            cfg['config'].update(Entrypoint=['fixture'],WorkingDir='/fixture',StopSignal='SIGTERM')
            cfg['history'][0].update(created='2024-01-01T00:00:00Z',author='fixture',comment='public fixture')
        if target=='null-runtime':cfg['config']=None
        if target=='wrong-arch':cfg['architecture']='arm64' if arch=='amd64' else 'amd64'
        if target=='wrong-os':cfg['os']='windows'
        if target=='empty-variant':cfg['variant']=''
        if target=='high-variant':cfg['variant']='v8.1' if arch=='arm64' else 'v3'
        if target=='numeric-variant':cfg['variant']=1
        if target=='features':cfg['os.features']=[]
        if target=='wrong-rootfs':cfg['rootfs']['type']='overlay'
        if target=='diff-count':cfg['rootfs']['diff_ids']=[]
        if target=='bad-env':cfg['config']['Env']=[1]
        if target=='bad-labels':cfg['config']['Labels']={'wrong':1}
        if target=='bad-history':cfg['history']=[{'empty_layer':'true'}]
        if target=='bad-config-type':cfg['config']=True
        if target=='null-env':cfg['config']['Env']=None
        if target=='null-command':cfg['config']['Cmd']=None
        if target=='null-labels':cfg['config']['Labels']=None
        if target=='null-volume':cfg['config']['Volumes']=None
        if target=='bad-port-value':cfg['config']['ExposedPorts']={'8080/tcp':{'unsafe':'x'}}
        if target=='runtime-extension':cfg['config']['Healthcheck']={}
        if target=='proto':cfg['config']['Labels']['__proto__']='unsafe'
        if target=='constructor':cfg['config']['Labels']['constructor']='unsafe'
        if target=='prototype':cfg['config']['Labels']['prototype']='unsafe'
        if target=='depth':
            cur=cfg
            for _ in range(18):cur['extra']={};cur=cur['extra']
        if target=='nodes':cfg['extra']={str(i):i for i in range(2050)}
        if target=='string':cfg['config']['Env']=['x'*8193]
        if target=='history-limit':cfg['history']=[{}]*129
        if target=='layers-limit':layers=[desc(GZIP,LAYER)]*65;cfg['rootfs']['diff_ids']=[sha(TAR)]*65
        cb=enc(cfg,pretty)
        if target=='duplicate-key':cb=cb.replace(b'"architecture":',b'"arch\\u0069tecture":"amd64","architecture":',1)
        if target=='invalid-utf8':cb=b'\xff'
        if target=='invalid-json':cb=b'{'
        pool.append(cb)
        cd=desc(cb,CONFIG)
        if target=='config-size':cd['size']+=1
        if target=='config-media':cd['mediaType']='application/octet-stream'
        mf=dict(schemaVersion=2,mediaType=MANIFEST,config=cd,layers=layers,annotations={'fixture-role':role})
        if target=='docker-root':mf['mediaType']='application/vnd.docker.distribution.manifest.v2+json'
        if target=='schema':mf['schemaVersion']=1
        if target=='artifact':mf['artifactType']='application/vnd.example+json'
        if target=='subject':mf['subject']=desc(cb,CONFIG)
        if target=='layer-url':mf['layers'][0]['urls']=['https://evil.invalid/layer']
        if target=='embedded':mf['config']['data']=b64(cb)
        if target=='bad-size':mf['config']['size']=-1
        if target=='unsafe-size':mf['config']['size']=9007199254740992
        if target=='fractional-size':mf['config']['size']=1.5
        if target=='uppercase-digest':mf['config']['digest']=mf['config']['digest'].upper()
        if target=='sha512':mf['config']['digest']='sha512:'+'a'*128
        mb=enc(mf,pretty);pool.append(mb);pd=desc(mb,MANIFEST);pd['platform']={'os':'linux','architecture':arch}
        if target=='variant':pd['platform']['variant']='v1' if arch=='amd64' else 'v8'
        if target=='descriptor-size':pd['size']+=1
        if target=='descriptor-media':pd['mediaType']='application/octet-stream'
        if target=='descriptor-variant':pd['platform']['variant']=''
        entries.append(pd);platforms['linux/'+arch]={'digest':sha(mb),'smokeEvidenceRef':'artifact:100/'+role+'_'+arch}
    if mode=='single':root=pool[-1]
    else:
        if target=='duplicate-platform':entries[1]=copy.deepcopy(entries[0])
        root=enc(dict(schemaVersion=2,mediaType=INDEX,manifests=entries),pretty);pool.append(root)
    if target in ['nested','child-type']:
        inner=enc(dict(schemaVersion=2,mediaType=INDEX,manifests=entries));pool.append(inner)
        nd=desc(inner,INDEX if target=='nested' else MANIFEST);nd['platform']={'os':'linux','architecture':'amd64'}
        root=enc(dict(schemaVersion=2,mediaType=INDEX,manifests=[nd]));pool.append(root);platforms['linux/amd64']['digest']=sha(inner)
    if target in ['attestation','attestation-runnable']:
        ad=desc(pool[-1],MANIFEST);ad['platform']={'os':'linux' if target.endswith('runnable') else 'unknown','architecture':'amd64' if target.endswith('runnable') else 'unknown'}
        ad['annotations']={'vnd.docker.reference.type':'attestation-manifest'}
        root=enc(dict(schemaVersion=2,mediaType=INDEX,manifests=[entries[0],ad]));pool.append(root)
    return dict(repository='ghcr.io/tandavkrishna27/explorers-'+role,digest=sha(root),platforms=platforms),pool
def release(images):
    obj=dict(version=1,sourceCommit='a'*40,schemaVersion=SCHEMA_VERSION,producerRunId='100',producerRepository='tandavkrishna27/explorers.earth',producerWorkflow='.github/workflows/platform-candidate.yml',testEvidenceRef='artifact:100/qualification',images=images)
    obj['manifestDigest']=sha(json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode());return enc(obj)
CASES=[]
def case(name,target=None,mode='single',error=None):
    api,pool=graph('api',mode,target);web,wpool=graph('web',mode,target if target in ['pretty','scratch','shared-config','repeat-layer','variant','zstd-syntax'] else None)
    if target=='canonical-root':api['digest']=sha(json.dumps(json.loads(pool[-1]),sort_keys=True,separators=(',',':')).encode())
    if target=='index-as-child':api['platforms']['linux/amd64']['digest']=api['digest']
    if target=='unpromised-platform':del api['platforms']['linux/arm64']
    rb=release(dict(api=api,web=web))
    if target=='tamper-root':pool[-1]=pool[-1]+b' '
    if target=='tamper-config':pool[0]=pool[0]+b' '
    if target=='tamper-child':pool[1]=pool[1]+b' '
    if target=='missing-config':pool=pool[1:]
    if target=='missing-root':pool=pool[:-1]
    if target=='duplicate-buffer':pool.append(pool[0])
    if target=='unused':pool.append(b'{}')
    if target=='swap-role':pool,wpool=wpool,pool
    CASES.append(dict(name=name,expectedError=error,release=b64(rb),api=[b64(b) for b in pool],web=[b64(b) for b in wpool]))
for name,target,mode in [('single',None,'single'),('multi',None,'multi'),('baseline-variants','variant','multi'),('pretty-reordered','pretty','multi'),('scratch','scratch','single'),('shared-config-across-roles','shared-config','single'),('repeated-layer-reference','repeat-layer','single'),('zstd-syntax-only','zstd-syntax','single'),('ordinary-options','ordinary-options','single'),('null-runtime','null-runtime','single')]:case(name,target,mode)
for target in ['tamper-root','tamper-config','missing-config','swap-role']:case(target,target,error='OCI_BYTES_MISMATCH')
case('canonical-root','canonical-root','multi','OCI_BYTES_MISMATCH')
case('index-as-child','index-as-child','multi','OCI_MEMBERSHIP_MISMATCH')
case('unpromised-platform','unpromised-platform','multi','OCI_MEMBERSHIP_MISMATCH')
case('tamper-child','tamper-child','multi','OCI_BYTES_MISMATCH');case('missing-root','missing-root','single','OCI_BYTES_MISMATCH')
for target in ['config-size','descriptor-size']:case(target,target,'multi' if target.startswith('descriptor') else 'single','OCI_DESCRIPTOR_MISMATCH')
for target in ['wrong-arch','wrong-os']:case(target,target,error='OCI_MEMBERSHIP_MISMATCH')
for target in ['empty-variant','high-variant','numeric-variant','features','runtime-extension','docker-root','schema','artifact','subject','layer-url','embedded','config-media']:case(target,target,error='OCI_PROFILE_UNSUPPORTED')
case('nested','nested','single','OCI_PROFILE_UNSUPPORTED')
case('child-type','child-type','single','OCI_DESCRIPTOR_MISMATCH')
for target in ['descriptor-media','descriptor-variant','attestation','attestation-runnable']:case(target,target,'multi' if target.startswith('descriptor') else 'single','OCI_PROFILE_UNSUPPORTED')
for target in ['wrong-rootfs','diff-count','bad-env','bad-labels','bad-history','bad-config-type','null-env','null-command','null-labels','null-volume','bad-port-value','proto','constructor','prototype','duplicate-key','invalid-utf8','invalid-json','bad-size','unsafe-size','fractional-size','uppercase-digest','sha512']:case(target,target,error='OCI_METADATA_INVALID')
for target in ['depth','nodes','string','history-limit','layers-limit']:case(target,target,error='OCI_METADATA_LIMIT')
case('duplicate-platform','duplicate-platform','multi','OCI_MEMBERSHIP_MISMATCH');case('duplicate-buffer','duplicate-buffer','single','OCI_DUPLICATE_BYTES');case('unused','unused','single','OCI_UNUSED_BYTES')
raw=enc(CASES);(OUT/'cases.json').write_bytes(raw)
receipt={name:dict(size=len((OUT/name).read_bytes()),digest=sha((OUT/name).read_bytes())) for name in ['cases.json','layer.tar','layer.tar.gz']}
(OUT/'receipt.json').write_bytes(enc(receipt))
print(len(CASES),'independently generated cases')
