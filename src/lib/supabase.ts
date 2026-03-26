import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kccdttwbjheadqnakqje.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjY2R0dHdiamhlYWRxbmFrcWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODUzMzEsImV4cCI6MjA4ODc2MTMzMX0.r3UC0iwNgS6LJ3BneQwT4hXncNAuP9MZzUwJXEoCwPo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
  },
});
