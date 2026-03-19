import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY')
};
