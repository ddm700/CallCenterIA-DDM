import { supabase } from '../lib/supabaseClient';
import { LogEntry } from '../types';

export const logService = {
  
  async getLogs(): Promise<LogEntry[]> {
    try {
      const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Failed to fetch logs from DB:', error);
        return [];
      }

      return (data || []).map((log: any) => ({
        id: log.id,
        timestamp: log.created_at,
        level: log.level,
        category: log.category,
        message: log.message,
        details: log.details
      }));
    } catch (e) {
      console.error('Exception fetching logs:', e);
      return [];
    }
  },

  async addLog(level: LogEntry['level'], category: string, message: string, details?: any) {
    // Console mirror for immediate devtools feedback
    const consoleMsg = `[${category}] ${message}`;
    if (level === 'error') console.error(consoleMsg, details);
    else if (level === 'warn') console.warn(consoleMsg, details);
    else console.log(consoleMsg, details);

    try {
      // Prepare payload
      const payload = {
        level,
        category,
        message,
        details: details ? details : null 
      };

      // Fire and forget insert to DB
      const { error } = await supabase.from('system_logs').insert([payload]);

      if (error) {
        console.error('Supabase Log Insert Error:', error);
      } else {
        // Dispatch event to update UI if open
        window.dispatchEvent(new Event('system-log-update'));
      }
      
    } catch (e) {
      console.error('Failed to save log to DB', e);
    }
  },

  async clearLogs() {
    // Optional: Clear logs from DB (be careful with this in production)
    try {
        await supabase.from('system_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        window.dispatchEvent(new Event('system-log-update'));
    } catch (e) {
        console.error('Error clearing logs', e);
    }
  }
};