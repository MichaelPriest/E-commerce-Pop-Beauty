import Link from 'next/link';
import {ArrowLeft,FileLock2,Route,ShieldCheck,Download} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';

export const dynamic='force-dynamic';
export const metadata={title:'Documentos e rastreio | Popê Beauty'};

const documentLabels:Record<string,string>={
 official_label:'Etiqueta recebida',
 posting_receipt:'Comprovante de postagem',
 posting_manifest:'Manifesto de postagem'
};
export default async function ShipmentEvidencePage(){
 const sb=await requireAdmin();
 const [documents,tracking,accesses]=await Promise.all([
  sb.from('shipment_provider_documents')
   .select('id,order_id,request_id,document_type,provider_document_id,verified_at')
   .order('verified_at',{ascending:false}).limit(100),
  sb.from('shipment_tracking_provider_events')
   .select('id,order_id,provider,carrier_status,description,provider_event_id,occurred_at,received_at')
   .order('received_at',{ascending:false}).limit(100),
  sb.from('shipment_document_access_events')
   .select('id,document_id,order_id,accessed_at')
   .order('accessed_at',{ascending:false}).limit(60)
 ]);
 if(documents.error||tracking.error||accesses.error)
  throw new Error('Não foi possível consultar os registros privados da logística.');
 const docs=documents.data??[],events=tracking.data??[],logs=accesses.data??[];
 const downloadsEnabled=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">POPÊ BEAUTY • EXPEDIÇÃO SEGURA</div>
   <h1><ShieldCheck size={29}/> Documentos e rastreamento</h1>
   <p>Evidências dos provedores e histórico de acesso, em modo somente leitura.</p>
  </div><Link className="admin-outline" href="/admin/remessas">
   <ArrowLeft size={16}/> Central de remessas</Link></div>
  <div className="admin-metric-row">
   <div><FileLock2/><small>Documentos recebidos</small><strong>{docs.length}</strong></div>
   <div><Route/><small>Eventos autenticados</small><strong>{events.length}</strong></div>
   <div><Download/><small>Downloads auditados (últimos 60)</small><strong>{logs.length}</strong></div>
   <div><ShieldCheck/><small>Leitura protegida</small>
    <strong>{downloadsEnabled?'Configurada':'Bloqueada'}</strong></div>
  </div>
  <p className="ops-info">Esta página não emite notas fiscais, compra frete,
   cancela postagens nem inventa rastreamentos. Documentos oficiais só entram por
   um integrador homologado no servidor. O caminho privado nunca é exposto ao cliente.</p>
  <section className="ops-form-card">
   <h2>Documentos privados</h2>
   {docs.length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Pedido</th><th>Tipo</th><th>Identificador do parceiro</th>
     <th>Verificado em</th><th>Download</th></tr></thead>
    <tbody>{docs.map(d=><tr key={d.id}>
     <td><Link href={'/admin/logistica/volumes/'+d.order_id}>
      #{d.order_id.slice(0,8).toUpperCase()}</Link></td>
     <td>{documentLabels[d.document_type]??d.document_type}</td>
     <td>{d.provider_document_id}</td>
     <td>{new Date(d.verified_at).toLocaleString('pt-BR')}</td>
     <td>{downloadsEnabled?<a className="ops-small primary"
      href={'/api/admin/shipping/documents/'+d.id}>Baixar PDF protegido</a>:
      'Aguardando credencial do servidor'}</td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-help">Nenhuma etiqueta oficial, comprovante ou
    manifesto recebido dos provedores até o momento.</p>}
  </section>
  <section className="ops-form-card">
   <h2>Ocorrências verificadas da transportadora</h2>
   {events.length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Pedido</th><th>Transportadora</th><th>Status retornado</th>
     <th>Data da ocorrência</th><th>Recebido em</th></tr></thead>
    <tbody>{events.map(e=><tr key={e.id}>
     <td><Link href={'/admin/logistica/volumes/'+e.order_id}>
      #{e.order_id.slice(0,8).toUpperCase()}</Link></td>
     <td>{e.provider==='melhor_envio'?'Melhor Envio':'Correios'}</td>
     <td><strong>{e.carrier_status}</strong>
      {e.description?<small>{e.description}</small>:null}</td>
     <td>{new Date(e.occurred_at).toLocaleString('pt-BR')}</td>
     <td>{new Date(e.received_at).toLocaleString('pt-BR')}</td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-help">Ainda não existem eventos autenticados
    de transporte. Os estados internos de preparação não são provas de entrega.</p>}
  </section>
  <section className="ops-form-card">
   <h2>Auditoria de documentos</h2>
   {logs.length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Data do download</th><th>Pedido</th><th>Documento</th></tr></thead>
    <tbody>{logs.map(e=><tr key={e.id}>
     <td>{new Date(e.accessed_at).toLocaleString('pt-BR')}</td>
     <td>#{e.order_id.slice(0,8).toUpperCase()}</td>
     <td>#{e.document_id.slice(0,8).toUpperCase()}</td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-help">Nenhum PDF oficial foi baixado por este módulo.</p>}
  </section>
 </div>;
}
