import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data', 'cbm-zero.json');
const NEVER_ZERO_PATH = path.join(process.cwd(), 'data', 'cbm-never-zero.json');
const ALL_SKUS_PATH = path.join(process.cwd(), 'data', 'cbm-all-skus.json');

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    if (type === 'never-zero') {
      if (!fs.existsSync(NEVER_ZERO_PATH)) return NextResponse.json([]);
      return NextResponse.json(JSON.parse(fs.readFileSync(NEVER_ZERO_PATH, 'utf8')));
    }
    if (type === 'all') {
      if (!fs.existsSync(ALL_SKUS_PATH)) return NextResponse.json([]);
      return NextResponse.json(JSON.parse(fs.readFileSync(ALL_SKUS_PATH, 'utf8')));
    }
    if (!fs.existsSync(DATA_PATH)) return NextResponse.json([]);
    return NextResponse.json(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
  } catch {
    return NextResponse.json([]);
  }
}
