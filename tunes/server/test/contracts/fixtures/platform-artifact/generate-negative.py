import io,zipfile,pathlib,warnings
warnings.filterwarnings('ignore', category=UserWarning)
base=pathlib.Path('tunes/server/test/contracts/fixtures/platform-artifact')
def emit(label,items):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as archive:
        for name,payload,attrs,extras in items:
            info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=attrs;info.extra=extras
            archive.writestr(info,payload)
    (base/(label+'.zip')).write_bytes(out.getvalue())
normal=('release-manifest.json',b'{"version":1}',0o100644<<16,b'')
for label,name in [('traversal','../release-manifest.json'),('absolute','/release-manifest.json'),('drive','C:/release-manifest.json'),('backslash','folder\\release-manifest.json'),('directory','release-manifest.json/')]:
    emit(label,[(name,b'{}',0o100644<<16,b'')])
emit('duplicate',[normal,normal])
emit('unicode-extra',[('release-manifest.json',b'{}',0o100644<<16,b'\x75\x70\x01\x00\x00')])
emit('manifest-bomb',[('release-manifest.json',b'x'*65537,0o100644<<16,b'')])
emit('receipt-bomb',[normal,('qualification.json',b'x'*131073,0o100644<<16,b'')])
emit('entry-count',[normal]*33)
emit('missing-manifest',[('qualification.json',b'{}',0o100644<<16,b'')])
emit('device',[('release-manifest.json',b'{}',0o20644<<16,b'')])
emit('invalid-utf8',[('release-manifest.json',b'\xff',0o100644<<16,b'')])
