import ExcelJS from 'exceljs';
import { ContactInput } from '../types';
import { normalizeCpf, normalizePhone } from './normalize';

type ColMap = {
  name?: number;
  cpf?: number;
  institution?: number;
  phone1?: number;
  phone2?: number;
  phone3?: number;
};

function keyOf(s: string): string {
  return (s ?? '').toString().trim().toLowerCase();
}

export async function parseContactsFromXlsx(
  input: unknown
): Promise<{ contacts: ContactInput[]; errors: string[] }> {

  let buffer: Buffer;

  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (input instanceof ArrayBuffer) {
    buffer = Buffer.from(new Uint8Array(input));
  } else if (input instanceof SharedArrayBuffer) {
    buffer = Buffer.from(new Uint8Array(input));
  } else {
    return {
      contacts: [],
      errors: ['Formato de arquivo inválido']
    };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer) as any);



  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { contacts: [], errors: ['Arquivo não possui planilha.'] };
  }

  const headerRow = sheet.getRow(1);
  const map: ColMap = {};

  headerRow.eachCell((cell, colNumber) => {
    const k = keyOf(String(cell.value ?? ''));
    if (['nome', 'name'].includes(k)) map.name = colNumber;
    if (['cpf'].includes(k)) map.cpf = colNumber;
    if (['instituicao', 'instituição', 'institution'].includes(k)) map.institution = colNumber;
    if (['telefone1', 'phone1', 'tel1'].includes(k)) map.phone1 = colNumber;
    if (['telefone2', 'phone2', 'tel2'].includes(k)) map.phone2 = colNumber;
    if (['telefone3', 'phone3', 'tel3'].includes(k)) map.phone3 = colNumber;
  });

  const missing: string[] = [];
  if (!map.name) missing.push('nome');
  if (!map.cpf) missing.push('cpf');
  if (!map.phone1) missing.push('telefone1');

  if (missing.length) {
    return {
      contacts: [],
      errors: [`Colunas obrigatórias ausentes: ${missing.join(', ')}`]
    };
  }

  const contacts: ContactInput[] = [];
  const errors: string[] = [];

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);

    const rawName = String(row.getCell(map.name!).value ?? '').trim();
    const rawCpf = String(row.getCell(map.cpf!).value ?? '').trim();
    const rawInst = map.institution
      ? String(row.getCell(map.institution).value ?? '').trim()
      : '';

    const phones = [map.phone1, map.phone2, map.phone3]
      .filter(Boolean)
      .map((c) => String(row.getCell(c!).value ?? '').trim())
      .filter(Boolean)
      .map(normalizePhone)
      .filter((v) => v.length >= 8);

    if (!rawName || !rawCpf || phones.length === 0) {
      errors.push(`Linha ${i}: inválida (nome/cpf/telefone).`);
      continue;
    }

    contacts.push({
      name: rawName,
      cpf: normalizeCpf(rawCpf),
      institution: rawInst || null,
      phones
    });
  }

  return { contacts, errors };
}


