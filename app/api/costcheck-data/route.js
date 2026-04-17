import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

function loadData() {
  try {
    if (fs.existsSync(PATHS.costcheckData)) return JSON.parse(fs.readFileSync(PATHS.costcheckData, 'utf8'));
  } catch {}
  return { confirmed: {}, memos: {}, reasons: {}, todos: {} };
}

function saveData(data) {
  fs.writeFileSync(PATHS.costcheckData, JSON.stringify(data), 'utf8');
}

export async function GET() {
  return NextResponse.json(loadData());
}

export async function POST(req) {
  const body = await req.json();
  const data = loadData();
  if (body.type === 'confirmed') data.confirmed = body.data;
  else if (body.type === 'memos') data.memos = body.data;
  else if (body.type === 'reasons') data.reasons = body.data;
  else if (body.type === 'todos') data.todos = body.data;
  else if (body.type === 'all') Object.assign(data, body.data);
  saveData(data);
  return NextResponse.json({ success: true });
}
