import Link from 'next/link';
export function Brand({compact=false}:{compact?:boolean}) {
  return <Link href="/" className={'brand '+(compact?'brand-compact':'')} aria-label="Popê Beauty - início">
    <span className="brand-mark" aria-hidden="true">♛<span>♥</span></span>
    <span className="brand-letter"><b>Popê</b><em>Beauty</em></span>
  </Link>;
}
