import {Metadata} from 'next';
import {ResetPasswordForm} from './reset-password-form';
export const metadata:Metadata={title:'Redefinir senha | Popê Beauty',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function ResetPasswordPage(){return <ResetPasswordForm/>;}
