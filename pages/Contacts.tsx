import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Badge, Input, Modal } from '../components/ui';
import { Search, Upload, Plus, Trash2, Phone, RotateCw, FileSpreadsheet, FileText, RefreshCw, Layers, List, Download, AlertCircle, Edit, Loader2, Save } from 'lucide-react';
import { Contact, Campaign } from '../types';
import { supabaseService } from '../services/supabaseService';
import { logService } from '../services/logService';
import { campaignService } from '../services/api';
import * as XLSX from 'xlsx';

export const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaignsList, setCampaignsList] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Interaction State
  const [callingContactId, setCallingContactId] = useState<string | null>(null);

  // Create Modal State (NEW)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    cpf: '',
    phone: '',
    institution: '',
    campaignId: ''
  });
  const [creating, setCreating] = useState(false);

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCampaignId, setImportCampaignId] = useState('');
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ pct: number; label: string } | null>(null);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', cpf: '' });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];

  const handleFilterChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (value: T) => {
      setter(value);
      setCurrentPage(1);
    };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [contactsData, campaignsData] = await Promise.all([
        supabaseService.getContacts(),
        supabaseService.getCampaigns()
      ]);
      setContacts(contactsData);
      setCampaignsList(campaignsData);
    } catch (error: any) {
      console.error(error);
      logService.addLog('error', 'Database', 'Erro ao carregar dados', { error: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- ACTIONS ---

  const handleCallContact = async (contact: Contact) => {
    if (callingContactId) return;

    if (!contact.phone) {
      alert("Este contato não possui número de telefone.");
      return;
    }

    if (!confirm(`Deseja iniciar uma ligação individual para ${contact.name} (${contact.phone})?`)) return;

    setCallingContactId(contact.id);
    try {
      await campaignService.callSingleContact(contact);
    } catch (error) {
      console.error("Erro ao ligar:", error);
    } finally {
      setCallingContactId(null);
    }
  };

  const handleResetContact = async (id: string) => {
    if (!confirm('Deseja resetar as tentativas e status deste contato? Ele será discado novamente na próxima execução da campanha.')) return;
    try {
      await supabaseService.resetContactAttempts(id);
      // Optimistic update
      setContacts(prev => prev.map(c => c.id === id ? { ...c, attempts: 0, status: 'pendente' } : c));
      logService.addLog('info', 'Contacts', `Contato ${id} resetado manualmente.`);
    } catch (e) {
      alert('Erro ao resetar contato.');
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este contato da campanha?')) return;
    try {
      await supabaseService.deleteContact(id);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      alert('Erro ao excluir contato.');
    }
  };

  // --- CREATE ACTION (NEW) ---

  const handleCreateSubmit = async () => {
    if (!createForm.campaignId) return alert('Selecione uma campanha.');
    if (!createForm.name || !createForm.phone) return alert('Nome e Telefone são obrigatórios.');

    // Validação de CPF obrigatório
    if (!createForm.cpf || createForm.cpf.trim() === '') {
      return alert('CPF é obrigatório.');
    }

    // Validação de formato de CPF (11 dígitos)
    const cpfDigits = createForm.cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      return alert('CPF inválido. Deve conter 11 dígitos.');
    }

    setCreating(true);
    try {
      const contactData = [{
        nome: createForm.name,
        cpf: createForm.cpf,
        telefone: createForm.phone,
        instituicao: createForm.institution
      }];

      await supabaseService.importContacts(createForm.campaignId, contactData);

      alert('Contato criado com sucesso!');
      setIsCreateOpen(false);
      setCreateForm({ name: '', cpf: '', phone: '', institution: '', campaignId: '' });
      fetchData();
    } catch (e: any) {
      console.error(e);
      // Mensagem de erro específica para violação de constraint única
      if (e.message?.includes('duplicate') || e.message?.includes('idx_contacts_cpf_telefone')) {
        alert('Erro: Este CPF já está associado a este número de telefone.');
      } else {
        alert(`Erro ao criar contato: ${e.message}`);
      }
    } finally {
      setCreating(false);
    }
  };

  // --- EDIT ACTIONS ---

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setEditForm({ name: contact.name, phone: contact.phone, cpf: contact.cpf || '' });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingContact) return;

    // Validação de CPF obrigatório
    if (!editForm.cpf || editForm.cpf.trim() === '') {
      return alert('CPF é obrigatório.');
    }

    // Validação de formato de CPF (11 dígitos)
    const cpfDigits = editForm.cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      return alert('CPF inválido. Deve conter 11 dígitos.');
    }

    console.log('🔄 Atualizando contato:', {
      contactId: editingContact.contactId,
      nome: editForm.name,
      telefone: editForm.phone,
      cpf: editForm.cpf,
      cpfNormalizado: cpfDigits
    });

    try {
      // Update the actual person record (contacts table), usually linked via contactId
      await supabaseService.updateContact(editingContact.contactId, {
        nome: editForm.name,
        telefone: editForm.phone,
        cpf: editForm.cpf
      });

      console.log('✅ Contato atualizado com sucesso no banco');

      // Update local state
      setContacts(prev => prev.map(c => c.id === editingContact.id ? { ...c, name: editForm.name, phone: editForm.phone, cpf: cpfDigits } : c));
      setIsEditOpen(false);
      alert('Contato atualizado com sucesso!');

      // Refresh data from server to ensure consistency
      await fetchData();
    } catch (e: any) {
      console.error('❌ Erro ao atualizar contato:', e);
      // Mensagem de erro específica para violação de constraint única
      if (e.message?.includes('duplicate') || e.message?.includes('idx_contacts_cpf_telefone')) {
        alert('Erro: Este CPF já está associado a este número de telefone.');
      } else {
        alert('Erro ao atualizar contato.');
      }
    }
  };

  // --- IMPORT ACTIONS ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImportFile(file);

      const reader = new FileReader();
      reader.onload = (evt: any) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);
          setImportPreview(data);
        } catch (error) {
          console.error(error);
          alert('Erro ao ler arquivo Excel/CSV.');
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleImportSubmit = async () => {
    console.log('Iniciando importação...', { campaignId: importCampaignId, rows: importPreview.length });

    if (!importCampaignId) return alert('Selecione uma campanha de destino.');
    if (!importPreview || importPreview.length === 0) return alert('O arquivo está vazio ou não pôde ser lido. Verifique o formato.');

    setImporting(true);
    setImportProgress({ pct: 0, label: 'Iniciando...' });
    try {
      // Map excel columns to expected format
      // Expected: nome, cpf, telefone, instituicao
      const formattedData = importPreview.map((row: any) => {
        // Normalize keys to lowercase to avoid case sensitivity issues
        const normalizedRow: any = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.toLowerCase().trim()] = row[key];
        });

        // Smart Phone Detection: look for common variations
        const phoneValue = normalizedRow['telefone'] ||
          normalizedRow['telefone1'] ||
          normalizedRow['phone'] ||
          normalizedRow['celular'] ||
          normalizedRow['mobile'] ||
          normalizedRow['whatsapp'] ||
          '';

        return {
          nome: normalizedRow['nome'] || normalizedRow['name'] || normalizedRow['cliente'] || 'Sem Nome',
          cpf: String(normalizedRow['cpf'] || normalizedRow['documento'] || ''),
          telefone: String(phoneValue),
          instituicao: normalizedRow['instituicao'] || normalizedRow['empresa'] || normalizedRow['organization'] || ''
        };
      }).filter(r => {
        // Validação: deve ter telefone E CPF válidos
        const hasPhone = r.telefone && r.telefone.replace(/\D/g, '').length > 5;
        const hasCpf = r.cpf && r.cpf.replace(/\D/g, '').length === 11;

        if (!hasPhone) console.warn('Skipping row without valid phone:', r);
        if (!hasCpf) console.warn('Skipping row without valid CPF (11 digits):', r);

        return hasPhone && hasCpf;
      });

      console.log('Dados formatados para envio:', formattedData.length);

      if (formattedData.length === 0) throw new Error("Nenhum contato válido encontrado. Verifique se as colunas 'telefone', 'nome' e 'cpf' existem e são válidas.");


      // flag atual chamando função original de importação: importContacts
      const USE_EDGE_IMPORT = true;

      // instruindo o usuario para esperar a thread de importação dependendo do volume de contatos, para evitar que ele cancele o processo por achar que travou
      if(formattedData.length >= 20000){
        alert("Volume alto de ligações, aguarde, pode levar alguns minutos para processar. Você receberá uma notificação quando estiver pronto.");
      }else{
        alert("Importação iniciada! Você receberá uma notificação quando estiver pronta. Aguarde uns segundos");
      }

      // chamada da funcao importContacts que processa os dados no frontend e envia para uma edge function para processamento assíncrono, evitando timeouts e sobrecarga no backend
      if (USE_EDGE_IMPORT) {

        const BATCH_SIZE = 2000;
        const total = formattedData.length;
        const totalBatches = Math.ceil(total / BATCH_SIZE);

        for (let i = 0; i < total; i += BATCH_SIZE) {

          const currentBatch = formattedData.slice(i, i + BATCH_SIZE);
          const currentBatchNumber = Math.floor(i / BATCH_SIZE) + 1;

          setImportProgress({
            pct: Math.round((currentBatchNumber - 1) / totalBatches * 100),
            label: `Processando lote ${currentBatchNumber} de ${totalBatches}...`
          });

          await supabaseService.importContacts(
            importCampaignId,
            currentBatch
          );
        }

        setImportProgress({
          pct: 100,
          label: 'Importação concluída.'
        });
      }

      alert(`Sucesso! ${formattedData.length} contatos foram enviados para processamento.`);
      setIsImportOpen(false);
      setImportFile(null);
      setImportPreview([]);
      setImportProgress(null);
      fetchData();
    } catch (e: any) {
      console.error('Erro no submit de importação:', e);
      setImportProgress(null);
      if (e.message?.includes('duplicate') || e.message?.includes('idx_contacts_cpf_telefone')) {
        alert('Erro: Alguns contatos possuem a mesma combinação CPF+Telefone já cadastrada.');
      } else {
        alert(`Erro na importação: ${e.message}`);
      }
    } finally {
      setImporting(false);
    }
  };

  // --- RENDER ---

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.phone.includes(searchTerm) ||
      contact.cpf.includes(searchTerm);
    const matchesCampaign = selectedCampaignFilter === 'all' || contact.campaignId === selectedCampaignFilter;

    return matchesSearch && matchesCampaign;
  });

  // Pagination derived values
  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedContacts = filteredContacts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filteredContacts.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredContacts.length);

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Gerenciamento de Contatos</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Visualize e gerencie leads de todas as campanhas</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" icon={RefreshCw} onClick={fetchData} title="Atualizar Lista" />
            <Button variant="danger" icon={Plus} onClick={() => setIsCreateOpen(true)}>Novo Contato</Button>
            <Button variant="outline" icon={Upload} onClick={() => setIsImportOpen(true)}>Importar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Input
              icon={Search}
              placeholder="Buscar por nome, telefone ou CPF..."
              value={searchTerm}
              onChange={(e) => handleFilterChange(setSearchTerm)(e.target.value)}
            />
          </div>
          <div>
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              value={selectedCampaignFilter}
              onChange={(e) => handleFilterChange(setSelectedCampaignFilter)(e.target.value)}
            >
              <option value="all">Todas as Campanhas</option>
              {campaignsList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Contacts Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Lista de Contatos</h3>
          <span className="text-sm text-slate-500">{filteredContacts.length} registros</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
            Carregando contatos...
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 border border-dashed border-slate-300 rounded-lg">
            Nenhum contato encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase font-semibold text-slate-500 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Nome / CPF</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tentativas</th>
                  <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {paginatedContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{contact.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{contact.cpf || '-'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{contact.phone}</td>
                    <td className="px-4 py-3 truncate max-w-[150px]" title={contact.campaignName}>
                      {contact.campaignName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={
                        contact.status === 'concluido' ? 'success' :
                          contact.status === 'falhou' ? 'danger' :
                            contact.status === 'em_andamento' ? 'primary' : 'neutral'
                      }>
                        {contact.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">{contact.attempts}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Call Button */}
                        <button
                          onClick={() => handleCallContact(contact)}
                          disabled={callingContactId === contact.id}
                          className={`p-1.5 rounded transition-colors ${callingContactId === contact.id
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-primary cursor-wait'
                            : 'hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 hover:text-green-700'
                            }`}
                          title="Ligar Agora"
                        >
                          {callingContactId === contact.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                        </button>

                        {/* Reset Button */}
                        <button
                          onClick={() => handleResetContact(contact.id)}
                          className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-blue-500 hover:text-blue-700 transition-colors"
                          title="Resetar Tentativas"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => openEditModal(contact)}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
                          title="Editar Contato"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-600 transition-colors"
                          title="Remover Contato"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && filteredContacts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left: range info */}
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Exibindo <span className="font-semibold text-slate-700 dark:text-slate-300">{rangeStart}–{rangeEnd}</span> de{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredContacts.length}</span> registros
            </p>

            {/* Center: page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Linhas por página:</span>
              <div className="flex items-center gap-1">
                {PAGE_SIZE_OPTIONS.map(size => (
                  <button
                    key={size}
                    onClick={() => { setPageSize(size); setCurrentPage(1); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${pageSize === size
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: prev / page indicator / next */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Anterior
              </button>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-400 min-w-[70px] text-center">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* CREATE MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Novo Contato"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Campanha</label>
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              value={createForm.campaignId}
              onChange={(e) => setCreateForm({ ...createForm, campaignId: e.target.value })}
            >
              <option value="">Selecione...</option>
              {campaignsList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <Input
            label="Nome do Cliente"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
          />

          <Input
            label="CPF *"
            placeholder="000.000.000-00 ou 00000000000"
            value={createForm.cpf}
            onChange={(e) => setCreateForm({ ...createForm, cpf: e.target.value })}
            required
          />

          <Input
            label="Telefone (com DDD)"
            placeholder="Ex: 31999999999"
            value={createForm.phone}
            onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
          />

          <Input
            label="Instituição/Empresa (Opcional)"
            value={createForm.institution}
            onChange={(e) => setCreateForm({ ...createForm, institution: e.target.value })}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button icon={Plus} onClick={handleCreateSubmit} disabled={creating}>
              {creating ? 'Salvando...' : 'Adicionar Contato'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* IMPORT MODAL */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Importar Contatos (Planilha)"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">1. Selecione a Campanha de Destino</label>
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              value={importCampaignId}
              onChange={(e) => setImportCampaignId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {campaignsList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">2. Upload do Arquivo (CSV ou Excel)</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-3 text-slate-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">Clique para enviar</span> ou arraste</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">XLSX ou CSV (Colunas obrigatórias: nome, telefone, cpf)</p>
                </div>
                <input type="file" className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileChange} />
              </label>
            </div>
            {importFile && (
              <div className="mt-2 text-sm text-green-600 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                {importFile.name} ({importPreview.length} linhas detectadas)
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="secondary" onClick={() => setIsImportOpen(false)} disabled={importing}>Cancelar</Button>
            <Button onClick={handleImportSubmit} disabled={!importFile || !importCampaignId || importing}>
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : 'Processar Importação'}
            </Button>
          </div>

          {/* Progress bar — shown during import */}
          {importing && importProgress && (
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                <span>{importProgress.label}</span>
                <span className="font-mono font-semibold text-primary">{importProgress.pct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${importProgress.pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>


      {/* EDIT MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Editar Contato"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <Input
            label="Nome do Cliente"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />

          <Input
            label="CPF *"
            placeholder="000.000.000-00 ou 00000000000"
            value={editForm.cpf}
            onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })}
            required
          />

          <Input
            label="Telefone (com DDD)"
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button icon={Save} onClick={handleSaveEdit}>Salvar</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
