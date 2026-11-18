import Link from 'next/link';
import {ArrowLeft,Tags} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import type {PromotionCoupon} from '@/lib/promotions/coupon-core';
import {CouponManager} from './coupon-manager';

export const dynamic='force-dynamic';
export const metadata={title:'Cupons e campanhas | Popê Beauty'};

export default async function AdminCouponsPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('promotion_coupons')
  .select('id,code,description,discount_type,discount_value,min_subtotal_cents,max_discount_cents,starts_at,ends_at,enabled,created_at,updated_at')
  .order('created_at',{ascending:false}).limit(400);
 if(error)return <div className="container admin-workspace">
  <h1>Cupons e promoções</h1>
  <p className="form-error" role="alert">Não foi possível carregar os cupons. Confira se a
   migração promotion_coupons_admin_v1.sql foi aplicada ao Supabase.</p>
  <Link href="/admin" className="admin-outline">Voltar ao painel</Link>
 </div>;
 return <div className="container admin-workspace pope-promotions-admin">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • CAMPANHAS COMERCIAIS</div>
    <h1><Tags size={27}/> Cupons e promoções</h1>
    <p>Cadastre descontos e faça simulações internas antes de integrá-los ao checkout.</p>
   </div>
   <Link href="/admin" className="admin-outline"><ArrowLeft size={16}/> Dashboard</Link>
  </div>
  <CouponManager coupons={(data??[]) as PromotionCoupon[]}/>
 </div>;
}
