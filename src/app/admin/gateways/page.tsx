import Link from 'next/link';
import {CreditCard,ShieldCheck,FlaskConical,KeyRound,ArrowLeft} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {PAYMENT_GATEWAYS,type PaymentGatewaySetting} from '@/lib/payment-gateways';
import {paymentGatewayEnvironments} from '@/lib/payment-gateways-server';
import {GatewayManager} from './gateway-manager';

export const dynamic='force-dynamic';
export default async function PaymentGatewaysPage(){
 const sb=await requireAdmin();
 const [gatewayRows,historyRows]=await Promise.all([
  sb.from('payment_gateway_settings')
   .select('provider,included_in_evaluation,preferred_for_sandbox,notes,updated_at,updated_by')
   .order('provider'),
  sb.from('payment_gateway_audit')
   .select('id,provider,event,old_included,new_included,old_candidate,new_candidate,created_at')
   .order('created_at',{ascending:false}).limit(20)
 ]);
 if(gatewayRows.error||historyRows.error)return <div className="container admin-workspace">
  <h1>Gateways de pagamento</h1>
  <p role="alert" className="form-error">Não foi possível carregar os gateways: {gatewayRows.error?.message||historyRows.error?.message}</p>
 </div>;
 const rows=(gatewayRows.data??[]) as PaymentGatewaySetting[];
 const environments=paymentGatewayEnvironments();
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">ESTRUTURA DE PAGAMENTOS • POPÊ BEAUTY</div>
   <h1><CreditCard size={29}/> Gateways de pagamento</h1>
   <p>Compare provedores e prepare credenciais de homologação antes de decidir qual utilizar na loja.</p>
  </div>
   <Link href="/admin/financeiro" className="admin-outline"><ArrowLeft size={16}/> Financeiro</Link>
  </div>
  <div className="admin-metric-row">
   <div><CreditCard/><small>Provedores no catálogo</small><strong>{PAYMENT_GATEWAYS.length}</strong></div>
   <div><FlaskConical/><small>Ambientes de teste disponíveis</small><strong>{PAYMENT_GATEWAYS.filter(g=>g.sandbox==='available').length}</strong></div>
   <div><KeyRound/><small>Credenciais de sandbox presentes*</small><strong>{environments.filter(g=>g.configured).length}</strong></div>
   <div><ShieldCheck/><small>Cobranças reais habilitadas</small><strong>0</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={18}/> Central de avaliação. As credenciais ficam somente em variáveis de ambiente no servidor Vercel, nunca no Supabase ou no navegador. Selecionar um candidato de homologação NÃO ativa checkout, Pix, cartão ou cobrança real. Nenhum pedido será marcado como pago nesta área. *Credenciais presentes ainda não significam autorização válida.</p>
  <GatewayManager initialRows={rows} environments={environments}
   history={(historyRows.data??[]) as {id:string;provider:string;event:string;created_at:string}[]}/>
 </div>;
}
