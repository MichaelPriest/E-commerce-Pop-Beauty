'use client';
import {Printer} from 'lucide-react';
export function PrintButton(){
 return <button type="button" className="admin-primary pope-print-actions"
  onClick={()=>window.print()}><Printer size={17}/> Imprimir / salvar em PDF</button>;
}
