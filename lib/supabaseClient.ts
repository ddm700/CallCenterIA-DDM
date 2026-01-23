import { createClient } from '@supabase/supabase-js';
import { getSupabaseSettings } from './settings';

// Load settings using the helper which checks LocalStorage then Env
const settings = getSupabaseSettings();
const supabaseUrl = settings.url;
const supabaseAnonKey = settings.key;

let supabaseInstance;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.error('Error creating Supabase client:', e);
  }
}

// If initialization failed or keys are missing, create a dummy client to prevent app crash
// The dummy client must support method chaining (select().order().limit()) to avoid "is not a function" errors.
if (!supabaseInstance) {
  const createMockBuilder = () => {
    return {
      select: () => createMockBuilder(),
      insert: () => createMockBuilder(),
      update: () => createMockBuilder(),
      delete: () => createMockBuilder(),
      upsert: () => createMockBuilder(),
      eq: () => createMockBuilder(),
      order: () => createMockBuilder(),
      limit: () => createMockBuilder(),
      single: () => createMockBuilder(),
      // Make the object thenable so it can be awaited like a Promise
      then: (resolve: any) => Promise.resolve({ 
        data: [], 
        error: { message: 'Supabase not configured. Please check Settings.' } 
      }).then(resolve)
    };
  };

  supabaseInstance = {
    from: () => createMockBuilder(),
    functions: {
      invoke: async () => ({ 
        data: null, 
        error: { message: 'Supabase functions not available in mock mode.' } 
      })
    }
  } as any;
  console.warn('Supabase credentials missing or invalid. App running in offline/mock mode.');
}

export const supabase = supabaseInstance;

export const checkSupabaseConnection = async () => {
  try {
    // Re-fetch in case they changed in localStorage (though client won't update without reload)
    const currentSettings = getSupabaseSettings();
    if (!currentSettings.url || !currentSettings.key) return false;
    
    // Use the exported instance
    const { error } = await supabase.from('campaigns').select('count', { count: 'exact', head: true });
    
    if (error) { 
        if (error.message && error.message.includes('Supabase not configured')) return false;
        
        // PGRST116 is acceptable (no rows found for single), implies connection reached DB
        if (error.code === 'PGRST116') return true;
        
        console.warn("Supabase connection check warning:", error.message);
        // If we have a specific Postgres error code, we likely connected. 
        return !!error.code; 
    }
    return true;
  } catch (e) {
    console.error("Supabase connection error:", e);
    return false;
  }
};