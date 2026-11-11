'use client';
import {IMaskInput} from 'react-imask';

export const onlyDigits=(value:string,max?:number)=>{
 const digits=value.replace(/\D/g,'');
 return typeof max==='number'?digits.slice(0,max):digits;
};

type BaseProps={
 value:string;onValueChange:(digits:string)=>void;
 id?:string;name?:string;placeholder?:string;
 required?:boolean;disabled?:boolean;
 autoComplete?:string;className?:string;
 'aria-label'?:string;
};
export function CepInput({value,onValueChange,placeholder='00000-000',...props}:BaseProps){
 return <IMaskInput
  mask="00000-000" value={onlyDigits(value,8)} unmask={true}
  onAccept={unmasked=>onValueChange(onlyDigits(String(unmasked),8))}
  inputMode="numeric" placeholder={placeholder} {...props}/>;
}
export function PhoneInput({value,onValueChange,placeholder='(11) 99999-9999',...props}:BaseProps){
 return <IMaskInput
  mask={[{mask:'(00) 0000-0000'},{mask:'(00) 00000-0000'}]}
  value={onlyDigits(value,11)} unmask={true}
  onAccept={unmasked=>onValueChange(onlyDigits(String(unmasked),11))}
  inputMode="tel" placeholder={placeholder} {...props}/>;
}
/** Máscaras disponíveis para formulários futuros; não coletam nem armazenam documentos. */
export function CpfInput({value,onValueChange,placeholder='000.000.000-00',...props}:BaseProps){
 return <IMaskInput mask="000.000.000-00" value={onlyDigits(value,11)} unmask={true}
  onAccept={v=>onValueChange(onlyDigits(String(v),11))}
  inputMode="numeric" placeholder={placeholder} {...props}/>;
}
export function CnpjInput({value,onValueChange,placeholder='00.000.000/0000-00',...props}:BaseProps){
 return <IMaskInput mask="00.000.000/0000-00" value={onlyDigits(value,14)} unmask={true}
  onAccept={v=>onValueChange(onlyDigits(String(v),14))}
  inputMode="numeric" placeholder={placeholder} {...props}/>;
}
