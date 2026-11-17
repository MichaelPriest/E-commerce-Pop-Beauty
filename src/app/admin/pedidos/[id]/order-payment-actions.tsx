'use client';

import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Copy,Link2,Search} from 'lucide-react';
import {dateTimeBR} from '@/types/operations';

type Props = {
  orderId: string;
  activeCheckout: {checkout_url: string | null; expires_at: string} | null;
  canCreate: boolean;
  canReconcile: boolean;
};

export function OrderPaymentActions({orderId,activeCheckout,canCreate,canReconcile}: Props) {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [paymentId,setPaymentId] = useState('');
  const url = canCreate ? activeCheckout?.checkout_url : null;

  async function run(action: 'link' | 'reconcile') {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/payments/mercadopago/order', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({action,order_id:orderId,payment_id:paymentId.trim()}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível concluir a operação.');
      setMessage(action === 'link' ? 'Link disponível para compartilhar.' : data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function copyLink(link: string) {
    setError('');
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Link copiado.');
    } catch {
      setError('Selecione o link e copie pelo navegador.');
    }
  }

  function reconcile(event: FormEvent) {
    event.preventDefault();
    void run('reconcile');
  }

  return <div className="admin-form">
    {canCreate && !activeCheckout ? <div>
      <button type="button" className="admin-primary" disabled={busy} onClick={() => void run('link')}>
        <Link2 size={17}/> {busy ? 'Aguarde…' : 'Gerar link de pagamento'}
      </button>
    </div> : null}
    {activeCheckout ? <p className="admin-help">
      {activeCheckout.checkout_url ? 'Link válido até ' : 'Preparação do link registrada. Vencimento em '}
      {dateTimeBR(activeCheckout.expires_at)}.
    </p> : null}
    {url ? <div className="admin-form">
      <label>Link para o cliente<input type="url" readOnly value={url} onFocus={e => e.target.select()}/></label>
      <div><button type="button" className="admin-outline" onClick={() => void copyLink(url)}>
        <Copy size={16}/> Copiar link</button></div>
    </div> : null}
    {canReconcile ? <form className="admin-form" onSubmit={reconcile}>
      <label>ID do pagamento no Mercado Pago
        <input type="text" inputMode="numeric" pattern="[0-9]{1,24}" maxLength={24}
          required value={paymentId} onChange={e => setPaymentId(e.target.value)}/>
      </label>
      <div><button type="submit" className="admin-outline" disabled={busy}>
        <Search size={16}/> Consultar e conciliar</button></div>
    </form> : null}
    {message ? <p className="form-success" role="status">{message}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
