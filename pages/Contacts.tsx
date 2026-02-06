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
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25); // Show 25 per page
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

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', cpf: '' });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState('all');

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      // Pass filters if needed, currently handling search client-side for simplicity 
      // but ideally should be server-side for true pagination of large sets.
      // For 322 records, fetching partials is fine, but filtering locally on partial data is weird.
      // Ideally we fetch filtered data from DB. 
      // For now, let's fetch the page.

      const [contactsResponse, campaignsData] = await Promise.all([
        supabaseService.getContacts(page, itemsPerPage, { searchTerm }),
        supabaseService.getCampaigns()
      ]);

      setContacts(contactsResponse.data);
      setTotalCount(contactsResponse.count);
      setCampaignsList(campaignsData);
    } catch (error: any) {
      console.error(error);
      logService.addLog('error', 'Database', 'Erro ao carregar dados', { error: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(currentPage);
  }, [currentPage]); // Refetch when page changes

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

  const handleDeleteContact = async (id: string, contactName: string) => {
    // First confirmation: What type of deletion?
    const deleteType = confirm(
      `ATENÇÃO: Como deseja deletar "${contactName}"?\n\n` +
      `✅ OK = DELETAR PERMANENTEMENTE do banco de dados (não poderá ser recuperado)\n` +
      `❌ CANCELAR = Apenas remover desta campanha (contato permanece no banco)`
    );

    // If user cancels, ask if they want to just remove from campaign
    if (!deleteType) {
      const removeFromCampaign = confirm(
        `Deseja apenas REMOVER "${contactName}" desta campanha?\n\n` +
        `(O contato permanecerá no banco de dados e poderá ser adicionado a outras campanhas)`
      );

      if (!removeFromCampaign) return; // User cancelled everything

      // Remove from campaign only
      try {
        await supabaseService.deleteContact(id, false);
        setContacts(prev => prev.filter(c => c.id !== id));
        setTotalCount(prev => Math.max(0, prev - 1));
        alert('Contato removido da campanha com sucesso!');
      } catch (e) {
        alert('Erro ao remover contato da campanha.');
      }
      return;
    }

    // Permanent deletion confirmed
    const finalConfirm = confirm(
      `⚠️ CONFIRMAÇÃO FINAL ⚠️\n\n` +
      `Você está prestes a DELETAR PERMANENTEMENTE "${contactName}" do banco de dados.\n\n` +
      `Esta ação NÃO PODE ser desfeita!\n\n` +
      `Deseja continuar?`
    );

    if (!finalConfirm) return;

    try {
      await supabaseService.deleteContact(id, true);
      setContacts(prev => prev.filter(c => c.id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
      alert('Contato deletado permanentemente do banco de dados!');
    } catch (e) {
      alert('Erro ao deletar contato permanentemente.');
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
      let contactIdToReplace: string | null = null;
      let shouldReplaceContact = false;

      // 1. PRIORITY CHECK: CPF Duplicate (if CPF provided)
      if (createForm.cpf && createForm.cpf.trim()) {
        const existingByCpf = await supabaseService.getContactByCpf(createForm.cpf);

        if (existingByCpf) {
          const replaceConfirm = confirm(
            `⚠️ CPF DUPLICADO DETECTADO ⚠️\n\n` +
            `O CPF ${createForm.cpf} já pertence a:\n` +
            `Nome: ${existingByCpf.nome}\n` +
            `Telefone: ${existingByCpf.telefone}\n\n` +
            `✅ OK = SUBSTITUIR completamente o contato anterior (dados antigos serão perdidos)\n` +
            `❌ CANCELAR = Abortar operação`
          );

          if (!replaceConfirm) {
            setCreating(false);
            return;
          }

          // User confirmed replacement
          shouldReplaceContact = true;
          contactIdToReplace = existingByCpf.id;
        }
      }

      // 2. Secondary Check: Phone Duplicate (only if not replacing by CPF)
      if (!shouldReplaceContact) {
        const existingByPhone = await supabaseService.getContactByPhone(createForm.phone);

        if (existingByPhone) {
          const updateConfirm = confirm(
            `O número ${createForm.phone} já pertence ao contato "${existingByPhone.nome}".\n\n` +
            `Deseja ATUALIZAR este contato com os novos dados e adicioná-lo à campanha?\n` +
            `(Cancelar para abortar operação)`
          );

          if (!updateConfirm) {
            setCreating(false);
            return;
          }

          // Update existing contact
          await supabaseService.updateContact(existingByPhone.id, {
            nome: createForm.name,
            telefone: createForm.phone
          });
        }
      }

      // 3. If replacing contact, delete old one completely first
      if (shouldReplaceContact && contactIdToReplace) {
        await supabaseService.permanentlyDeleteContact(contactIdToReplace);
      }

      // 4. Create/Import the new contact
      const contactData = [{
        nome: createForm.name,
        cpf: createForm.cpf,
        telefone: createForm.phone,
        instituicao: createForm.institution
      }];

      await supabaseService.importContacts(createForm.campaignId, contactData);

      const successMessage = shouldReplaceContact
        ? 'Contato anterior substituído com sucesso!'
        : 'Contato criado com sucesso!';

      alert(successMessage);
      setIsCreateOpen(false);
      setCreateForm({ name: '', cpf: '', phone: '', institution: '', campaignId: '' });
      fetchData(currentPage);
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

      const result = await supabaseService.importContacts(importCampaignId, formattedData);

      // Build success message with details
      let message = `✅ Importação Concluída!\n\n`;
      message += `📥 Importados: ${result.imported} contatos\n`;

      if (result.skipped > 0) {
        message += `⚠️ Ignorados: ${result.skipped} contatos (CPF duplicado)\n\n`;
        message += `CPFs duplicados encontrados:\n`;
        result.duplicateCpfs.slice(0, 5).forEach(cpf => {
          message += `• ${cpf}\n`;
        });
        if (result.duplicateCpfs.length > 5) {
          message += `... e mais ${result.duplicateCpfs.length - 5} CPFs duplicados`;
        }
      }

      alert(message);
      setIsImportOpen(false);
      setImportFile(null);
      setImportPreview([]);
      fetchData(currentPage);
    } catch (e: any) {
      console.error('Erro no submit de importação:', e);
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
    // Note: Since we are paginating on server, client-side filtering only filters the current page.
    // Ideally, search should be triggered via API.
    const matchesSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.phone.includes(searchTerm) ||
      contact.cpf.includes(searchTerm);
    const matchesCampaign = selectedCampaignFilter === 'all' || contact.campaignId === selectedCampaignFilter;

    return matchesSearch && matchesCampaign;
  });

  const totalPages = Math.ceil(totalCount / itemsPerPage);

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
            <Button icon={Plus} onClick={() => setIsCreateOpen(true)}>Novo Contato</Button>
            <Button variant="outline" icon={Upload} onClick={() => setIsImportOpen(true)}>Importar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Input
              icon={Search}
              placeholder="Buscar por nome, telefone ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              value={selectedCampaignFilter}
              onChange={(e) => setSelectedCampaignFilter(e.target.value)}
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
          <div className="flex gap-2 items-center">
            <span className="text-sm text-slate-500">{totalCount} registros totais</span>
          </div>
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
                {filteredContacts.map((contact) => (
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
                          onClick={() => handleDeleteContact(contact.id, contact.name)}
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
      </Card>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-4">
        <div className="text-sm text-slate-500">
          Página {currentPage} de {totalPages || 1} ({totalCount} registros)
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            Próxima
          </Button>
        </div>
      </div>

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
            <Button variant="secondary" onClick={() => setIsImportOpen(false)}>Cancelar</Button>
            <Button onClick={handleImportSubmit} disabled={!importFile || !importCampaignId || importing}>
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : 'Processar Importação'}
            </Button>
          </div>
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