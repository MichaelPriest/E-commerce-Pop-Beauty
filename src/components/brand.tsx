import Link from 'next/link';
export function Brand({compact=false}:{compact?:boolean}) {
 return <Link href="/" className={'brand '+(compact?'brand-compact':'')} aria-label="Popê Beauty - início"><img className="brand-image" src="/logo.webp" alt="Popê Beauty"/></Link>;
}
