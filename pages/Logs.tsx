import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Input, Modal } from '../components/ui';
import { Search, Trash2, RefreshCw, AlertTriangle, CheckCircle, Info, XCircle, Code, Terminal } from 'lucide-react';
import { LogEntry } from '../types';
import { logService } from '../services/logService';

export const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    const data = await logService.getLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
    
    // Listen for updates from other parts of the app
    const handleUpdate = () => loadLogs();
    window.addEventListener('system-log-update', handleUpdate);
    return () => window.removeEventListener('system-log-update', handleUpdate);
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'all' || log.level === filterLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (log.details && JSON.stringify(log.details).toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesLevel && matchesSearch;
  });

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'error': return <Badge variant="danger">Erro</Badge>;
      case 'warn': return <Badge variant="warning">Aviso</Badge>;
      case 'success': return <Badge variant="success">Sucesso</Badge>;
      default: return <Badge variant="primary">Info</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <div className="flex items-center gap-3">
            <div className="bg-slate-900 text-white p-2 rounded-lg">
                <Terminal className="w-6 h-6" />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Logs do Sistema</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Monitoramento de eventos, integrações e erros (Banco de Dados)</p>
            </div>
         </div>
         <Button variant="danger" icon={Trash2} onClick={() => { logService.clearLogs(); }}>Limpar Logs</Button>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
           <div className="md:col-span-2">
              <Input 
                icon={Search} 
                placeholder="Buscar em mensagens ou detalhes JSON..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           <div>
              <select 
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent text-slate-600 dark:text-slate-300"
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
              >
                <option value="all">Todos os Níveis</option>
                <option value="error">Apenas Erros</option>
                <option value="warn">Avisos</option>
                <option value="success">Sucesso</option>
                <option value="info">Informação</option>
              </select>
           </div>
           <Button variant="secondary" icon={RefreshCw} onClick={loadLogs} disabled={loading}>
             {loading ? 'Carregando...' : 'Atualizar'}
           </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 w-[180px]">Timestamp</th>
                <th className="px-4 py-3 w-[100px]">Nível</th>
                <th className="px-4 py-3 w-[150px]">Categoria</th>
                <th className="px-4 py-3">Mensagem</th>
                <th className="px-4 py-3 w-[100px] text-right">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {loading && logs.length === 0 ? (
                 <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Carregando logs...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum log encontrado para os filtros atuais.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors font-mono text-xs">
                    <td className="px-4 py-3 text-slate-500">{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                            {getLevelIcon(log.level)}
                            <span className="capitalize">{log.level}</span>
                        </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">{log.category}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{log.message}</td>
                    <td className="px-4 py-3 text-right">
                       {log.details && (
                         <button 
                           onClick={() => setSelectedLog(log)}
                           className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-primary hover:text-primary-hover transition-colors"
                           title="Ver JSON"
                         >
                           <Code className="w-4 h-4" />
                         </button>
                       )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-xs text-slate-400 text-right">
            Mostrando {filteredLogs.length} registros (Máx: 100 recentes do BD)
        </div>
      </Card>

      {/* Details Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Detalhes do Log"
      >
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
                {selectedLog && getLevelBadge(selectedLog.level)}
                <span className="text-sm font-mono text-slate-500">{selectedLog?.timestamp}</span>
            </div>
            <div>
                <h4 className="font-semibold text-slate-900 dark:text-white">Mensagem:</h4>
                <p className="text-slate-700 dark:text-slate-300">{selectedLog?.message}</p>
            </div>
            
            <div className="bg-slate-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                <h4 className="text-xs uppercase text-slate-500 mb-2">Payload / Detalhes (JSON)</h4>
                <pre className="text-xs font-mono whitespace-pre-wrap">
                    {selectedLog?.details ? JSON.stringify(selectedLog.details, null, 2) : 'Nenhum detalhe adicional.'}
                </pre>
            </div>
        </div>
      </Modal>
    </div>
  );
};