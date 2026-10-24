import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import '../../test/englishI18n';
import {linkPreviewClient} from '../../lib/linkPreviewClient';
import PasteLinkField from '../PasteLinkField';
it('paste -> preview -> onPrefill once; failure shows the manual hint',async()=>{
 const preview=vi.spyOn(linkPreviewClient,'preview').mockResolvedValueOnce({url:'https://shop.example/p',title:'Trail Shoe',description:null,imageUrl:null,siteName:'Example',product:{name:'Trail Shoe',brand:'Acme',price:'119.90',currencyCode:'EUR'},person:null});
 const onPrefill=vi.fn();render(<PasteLinkField label="Where to buy" value="" onChange={()=>{}} onPrefill={onPrefill}/>);
 fireEvent.paste(screen.getByLabelText('Where to buy'),{clipboardData:{getData:()=>'https://shop.example/p'}});
 await waitFor(()=>expect(onPrefill).toHaveBeenCalledWith(expect.objectContaining({product:expect.objectContaining({brand:'Acme'})})));
 preview.mockRejectedValueOnce(new Error('LINK_PREVIEW_UNAVAILABLE'));
 fireEvent.paste(screen.getByLabelText('Where to buy'),{clipboardData:{getData:()=>'https://down.example'}});
 expect(await screen.findByText("Couldn't read that link, fill in manually")).toBeTruthy();
});
