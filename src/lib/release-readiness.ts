/** Avaliação somente informativa; nunca ativa pagamento, checkout ou serviços. */
export type ReadinessState='ready'|'pending'|'blocked'|'manual';
export type ReadinessItem={
 id:string;group:'Técnico'|'Catálogo'|'Logística'|'Pagamentos'|'Operação';
 title:string;detail:string;state:ReadinessState;
 href?:string;action?:string;
};
export const READINESS_LABELS:Record<ReadinessState,string>={
 ready:'Verificado',pending:'Pendente',blocked:'Bloqueio de produção',
 manual:'Exige validação manual'
};
export function summarizeReadiness(items:ReadonlyArray<ReadinessItem>){
 const counts:Record<ReadinessState,number>={ready:0,pending:0,blocked:0,manual:0};
 for(const item of items)counts[item.state]++;
 return {
  ...counts,total:items.length,
  /** Nunca deduzir liberação comercial de uma lista incompleta. */
  canOpen:false,
  needsAction:counts.blocked+counts.pending+counts.manual
 };
}
