import Link from 'next/link';
import {FileLock2,Route,ShieldCheck} from 'lucide-react';

export type VerifiedShippingDocument={
 id:string;request_id:string;document_type:string;provider_document_id:string;
 verified_at:string;created_at:string;
};
export type VerifiedTrackingEvent={
 id:string;request_id:string;provider:string;provider_event_id:string;
 carrier_status:string;description:string|null;occurred_at:string;received_at:string;
};
const documentName:Record<string,string>={
 official_label:'Etiqueta oficial recebida do provedor',
 posting_receipt:'Comprovante de postagem recebido',
 posting_manifest:'Manifesto de postagem recebido'
};

export function ShippingProviderEvidence({
 documents,tracking,downloadEnabled
}:{documents:VerifiedShippingDocument[];tracking:VerifiedTrackingEvent[];downloadEnabled:boolean}){
 return <section className="ops-form-card">
  <h2><ShieldCheck size={19}/> Evidências oficiais e rastreamento</h2>
  <p className="admin-help">Consulta somente leitura de documentos e ocorrências registrados
   por uma integração autenticada. As conferências internas não são eventos de rastreamento.
   Nenhuma movimentação ou cancelamento é realizado nesta seção.</p>
  <h3><FileLock2 size={17}/> Documentos do provedor ({documents.length})</h3>
  {!documents.length?<p className="admin-help">Nenhum documento oficial de transportadora
   recebido. A etiqueta interna para separação não é comprovante de postagem.</p>:
   <div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Documento</th><th>Recebido</th><th>Solicitação</th><th>Arquivo</th></tr></thead>
    <tbody>{documents.map(doc=><tr key={doc.id}>
     <td><strong>{documentName[doc.document_type]??doc.document_type}</strong>
      <small>ID do parceiro: {doc.provider_document_id}</small></td>
     <td>{new Date(doc.verified_at).toLocaleString('pt-BR')}</td>
     <td>#{doc.request_id.slice(0,8).toUpperCase()}</td>
     <td>{downloadEnabled?<a className="ops-small primary"
      href={'/api/admin/shipping/documents/'+doc.id}>Baixar PDF protegido</a>:
      <span className="ops-tag status-pending">Aguardando habilitação do servidor</span>}</td>
    </tr>)}</tbody>
   </table></div>}
  <h3><Route size={17}/> Eventos autenticados da transportadora ({tracking.length})</h3>
  {!tracking.length?<p className="admin-help">Nenhum evento autenticado do provedor
   disponível. A remessa não será marcada como enviada ou entregue automaticamente.</p>:
   <div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Ocorrência no provedor</th><th>Status retornado</th>
     <th>Identificador do evento</th><th>Registro</th></tr></thead>
    <tbody>{tracking.map(item=><tr key={item.id}>
     <td>{new Date(item.occurred_at).toLocaleString('pt-BR')}</td>
     <td><strong>{item.carrier_status}</strong>
      {item.description?<small>{item.description}</small>:null}</td>
     <td>{item.provider_event_id}</td>
     <td>{new Date(item.received_at).toLocaleString('pt-BR')}</td>
    </tr>)}</tbody>
   </table></div>}
  <p className="admin-help">O acesso ao PDF exige administrador autenticado, validação
   do vínculo com o pedido, conferência do SHA-256 e auditoria. Documentos e eventos
   só poderão ser inseridos por um adaptador oficial no servidor; o navegador não tem
   permissão direta de upload ou gravação.</p>
  <Link href="/admin/remessas/evidencias" className="admin-outline">
   Ver registro consolidado de documentos e rastreamento</Link>
 </section>;
}
