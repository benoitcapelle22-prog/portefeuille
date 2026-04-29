type VercelRequest = { query: Record<string, string | string[] | undefined> };
type VercelResponse = { status(c: number): VercelResponse; json(b: unknown): void; setHeader(k: string, v: string): void };

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true });
}