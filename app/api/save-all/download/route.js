import { NextResponse } from 'next/server';
import fs from 'fs';
import { PATHS } from '@/lib/paths';

export async function GET() {
  try {
    const XLSX = require('xlsx');
    let allData = {};
    if (fs.existsSync(PATHS.allData)) {
      allData = JSON.parse(fs.readFileSync(PATHS.allData, 'utf8'));
    }

    const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
    const costLabels = ['수수료 1%','해상운임','DOC FEE','원산지증명서','통관수수료','관세','부가세','내륙운송료'];
    const headers = ['출고', 'SKU', '품명', '수량', '단가(CNY)', '후불작업비용', '수수료7%', '원가(개당)', '원가(x285)', ...costLabels];
    const wsData = [headers];

    for (const [shipmentKey, entry] of Object.entries(allData)) {
      for (const r of entry.rows) {
        wsData.push([
          shipmentKey, r.sku, r.productName, r.shippedQty, r.unitPriceCny,
          0.7, r.commission, r.costPerUnit, Math.round(r.unitPriceRaw * 285),
          ...costKeys.map(k => r.costs?.[k]?.perUnit || 0),
        ]);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 18 }, { wch: 20 }, { wch: 40 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, '전체 수입원가');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="all_import_costs.xlsx"',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
