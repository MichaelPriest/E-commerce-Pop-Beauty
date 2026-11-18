'use client';
import {useActionState} from 'react';
import {updateDisplayName} from './profile-action';

export function DisplayNameForm({name}:{name:string}){
 const [state,action,pending]=useActionState(updateDisplayName,{saved:false,message:''});
 return <details className="customer-name-editor"><summary>Editar nome</summary>
  <form action={action}>
   <label htmlFor="display-name">Nome de exibição</label>
   <div><input id="display-name" name="display_name" defaultValue={name} autoComplete="name" required minLength={2} maxLength={80}/>
    <button className="customer-link-button" type="submit" disabled={pending}>{pending?'Salvando…':'Salvar nome'}</button></div>
   {state.message&&<span role={state.saved?'status':'alert'}>{state.message}</span>}
  </form>
 </details>;
}
