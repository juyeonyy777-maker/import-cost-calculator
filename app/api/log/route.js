import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOG_PATH = path.resolve('C:/Users/user/Desktop/클로드 전용 260320/사용로그.json');

function loadLogs() {
  try {
    if (fs.existsSync(LOG_PATH)) {
      return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveLogs(logs) {
  // 최근 10000건만 유지
  if (logs.length > 10000) logs = logs.slice(-10000);
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2), 'utf8');
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
    const logs = loadLogs();
    return NextResponse.json(logs);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
