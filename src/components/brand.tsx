import Link from 'next/link';
export function Brand({compact=false}:{compact?:boolean}) {
 return <Link href="/" className={'brand '+(compact?'brand-compact':'')} aria-label="Popê Beauty - início">
  <img className="brand-image" src="/logo-hd-512.webp"
   srcSet="/logo-hd-512.webp 512w, /logo-hd.webp 1024w"
   sizes="(max-width:760px) 66px, 99px"
   width={99} height={99} alt="Popê Beauty"/>
 </Link>;
}
