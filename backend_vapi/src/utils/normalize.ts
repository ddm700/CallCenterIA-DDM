export function onlyDigits(s: string): string {
  return (s ?? '').toString().replace(/\D+/g, '');
}

export function normalizeCpf(cpf: string): string {
  const d = onlyDigits(cpf);
  // não valida DV aqui; apenas normaliza
  return d;
}

export function normalizePhone(p: string): string {
  const d = onlyDigits(p);
  return d;
}
