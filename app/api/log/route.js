import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

function loadLogs() {
  try {
    if (fs.existsSync(PATHS.logs)) return JSON.parse(fs.readFileSync(PATHS.logs, 'utf8'));
  } catch (e) {}
  return [];
}

function saveLogs(logs) {
  if (logs.length > 10000) logs = logs.slice(-10000);
  fs.writeFileSync(PATHS.logs, JSON.stringify(logs, null, 2), 'utf8');
}

export async function POST(request) {
  try {
    const { userName, action, detail } = await request.json();
    const logs = loadLogs();
    logs.push({
      time: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      user: userName || '알수없음',
      action,
      detail: detail || '',
    });
    saveLogs(logs);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    return NextResponse.json(loadLogs());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
