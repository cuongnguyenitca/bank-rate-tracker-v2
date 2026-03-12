import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kccdttwbjheadqnakqje.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY_HERE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
