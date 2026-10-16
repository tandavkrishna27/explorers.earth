import io,zipfile,pathlib
base=pathlib.Path('tunes/server/test/contracts/fixtures/platform-artifact')
for name,method in [('stored',zipfile.ZIP_STORED),('deflated',zipfile.ZIP_DEFLATED)]:
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=method) as archive:
        for filename,content in [('release-manifest.json',b'{"version":1}'),('qualification.json',b'{"passed":true}')]:
            info=zipfile.ZipInfo(filename,(2020,1,1,0,0,0));info.compress_type=method;info.create_system=3;info.external_attr=(0o100644<<16)
            archive.writestr(info,content)
    (base/(name+'.zip')).write_bytes(out.getvalue())
