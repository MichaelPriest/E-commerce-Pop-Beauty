import type {NextConfig} from 'next';
const nextConfig:NextConfig={
 reactStrictMode:true,
 outputFileTracingIncludes:{
  '/api/admin/order-operations':['./emails/pedidos/*.html'],
  '/api/admin/order-notifications':['./emails/pedidos/*.html']
 }
};
export default nextConfig;
