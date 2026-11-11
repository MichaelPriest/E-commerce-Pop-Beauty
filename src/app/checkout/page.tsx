import type {Metadata} from 'next';
import {CheckoutPreviewPage} from './preview-page';
export const dynamic='force-dynamic';
export const metadata:Metadata={
 title:'Conferência do carrinho | Popê Beauty',
 robots:{index:false,follow:false}
};
export default function CheckoutPage(){return <CheckoutPreviewPage/>;}
