export default function handler(req: any, res: any) {
  res.status(404).json({ success: false, error: `Rota não encontrada: ${req.url}` });
}
