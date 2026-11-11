/** Política de interface. A regra deve ser replicada no Supabase Auth para não ser burlada via API. */
export function passwordIssue(password:string):string|null {
 if(password.length<12)return 'A senha precisa ter pelo menos 12 caracteres.';
 if(!/[a-z]/.test(password))return 'Inclua pelo menos uma letra minúscula.';
 if(!/[A-Z]/.test(password))return 'Inclua pelo menos uma letra maiúscula.';
 if(!/[0-9]/.test(password))return 'Inclua pelo menos um número.';
 if(!/[^A-Za-z0-9]/.test(password))return 'Inclua pelo menos um símbolo.';
 if(password.length>72)return 'Utilize uma senha de até 72 caracteres.';
 return null;
}
