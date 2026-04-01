import { NextResponse } from 'next/server';
import { parseExcel } from '@/lib/parsers/excel-parser';
import { parseInvoicePdf } from '@/lib/parsers/invoice-parser';
import { parseDeclarationPdf } from '@/lib/parsers/declaration-parser';
import { calculateImportCosts } from '@/lib/calculator';
import { PATHS } from '@/lib/paths';
import fs from 'fs';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const excelFile = formData.get('excel');
    const excelFile2 = formData.get('excel2');
    const invoiceFile = formData.get('invoice');
    const declarationFile = formData.get('declaration');
    const exchangeRateInput = formData.get('exchangeRate');

    if (!excelFile) {
      return NextResponse.json({ error: '결제명세서 Excel 파일이 필요합니다.' }, { status: 400 });
    }

    const XLSX = require('xlsx');

    // 결제명세서 검증
    const excelBuf = Buffer.from(await excelFile.arrayBuffer());
    try {
      const wb = XLSX.read(excelBuf, { type: 'buffer' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const headers = data.slice(0, 5).map(r => (r || []).join(' ')).join(' ');
      const missing = ['SKU', '단가', '총금액', '환율'].filter(k => !headers.includes(k));
      if (missing.length > 0) {
        return NextResponse.json({ error: `결제명세서 형식 오류\n필수 항목 누락: ${missing.join(', ')}` }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: `결제명세서 읽기 실패: ${e.message}` }, { status: 400 });
    }

    // 출고내역 검증
    if (excelFile2 && excelFile2.size > 0) {
      const buf2 = Buffer.from(await excelFile2.arrayBuffer());
      try {
        const wb2 = XLSX.read(buf2, { type: 'buffer' });
        const data2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 });
        const headers2 = data2.slice(0, 5).map(r => (r || []).join(' ')).join(' ');
        const missing2 = ['SKU', '출고수량'].filter(k => !headers2.includes(k));
        if (missing2.length > 0) {
          return NextResponse.json({ error: `출고내역 형식 오류\n필수 항목 누락: ${missing2.join(', ')}` }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({ error: `출고내역 읽기 실패: ${e.message}` }, { status: 400 });
      }
    }

    // 청구서 PDF 검증
    if (invoiceFile && invoiceFile.size > 0) {
      const invBuf = Buffer.from(await invoiceFile.arrayBuffer());
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const pdf = await pdfParse(invBuf);
        const missing3 = ['KRW', 'TOTAL'].filter(k => !pdf.text.toUpperCase().includes(k));
        if (missing3.length > 0) {
          return NextResponse.json({ error: `청구서 PDF 형식 오류\n필수 항목 누락: ${missing3.join(', ')}` }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({ error: `청구서 읽기 실패: ${e.message}` }, { status: 400 });
      }
    }

    // 엑셀 파싱
    const excelData = parseExcel(excelBuf);

    // 출고내역 파싱 → 수량/CBM 덮어쓰기
    if (excelFile2 && excelFile2.size > 0) {
      const buf2 = Buffer.from(await excelFile2.arrayBuffer());
      const excel2Data = parseExcel(buf2);

      const qtyMap = {};
      for (const item of excel2Data.rawItems) {
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        qtyMap[item.sku] = (qtyMap[item.sku] || 0) + qty;
      }

      const boxMap = {};
      for (const item of excel2Data.rawItems) {
        const box = item.boxNo;
        if (!box) continue;
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        if (!boxMap[box]) boxMap[box] = { cbm: item.boxCbm || item.cbm || 0, totalQty: 0 };
        boxMap[box].totalQty += qty;
        if ((item.boxCbm || item.cbm || 0) > boxMap[box].cbm) boxMap[box].cbm = item.boxCbm || item.cbm || 0;
      }

      const skuCbmTotal = {}, skuQtyTotal = {};
      for (const item of excel2Data.rawItems) {
        const box = item.boxNo;
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        if (!box || !boxMap[box] || boxMap[box].totalQty === 0) continue;
        const cbmPerUnit = boxMap[box].cbm / boxMap[box].totalQty;
        skuCbmTotal[item.sku] = (skuCbmTotal[item.sku] || 0) + cbmPerUnit * qty;
        skuQtyTotal[item.sku] = (skuQtyTotal[item.sku] || 0) + qty;
      }

      let newTotalQty = 0, newTotalCbm = 0;
      for (const item of excelData.items) {
        if (qtyMap[item.sku] !== undefined) item.shippedQty = qtyMap[item.sku];
        if (skuCbmTotal[item.sku] !== undefined) item.totalCbm = skuCbmTotal[item.sku];
        newTotalQty += item.shippedQty;
        newTotalCbm += item.totalCbm || 0;
      }
      excelData.totals.totalQty = newTotalQty;
      excelData.totals.totalCbm = newTotalCbm;
      excelData.boxCount2 = excel2Data.boxCount;
    }

    // 청구서 PDF 파싱
    let invoiceData = null;
    if (invoiceFile && invoiceFile.size > 0) {
      const pdfParse = (await import('pdf-parse')).default;
      const buf = Buffer.from(await invoiceFile.arrayBuffer());
      const pdf = await pdfParse(buf);
      invoiceData = parseInvoicePdf(pdf.text);
    }

    // 정산서 PDF 파싱
    let declarationData = null;
    if (declarationFile && declarationFile.size > 0) {
      const pdfParse = (await import('pdf-parse')).default;
      const buf = Buffer.from(await declarationFile.arrayBuffer());
      const pdf = await pdfParse(buf);
      declarationData = parseDeclarationPdf(pdf.text);
    }

    const exchangeRateCNY = exchangeRateInput ? parseFloat(exchangeRateInput) : 0;
    const result = calculateImportCosts({ excelData, invoiceData, declarationData, exchangeRateCNY });

    // 위안화 정보 엑셀 로드
    let yuanMap = {};
    try {
      if (fs.existsSync(PATHS.yuanInfo)) {
        const buf = fs.readFileSync(PATHS.yuanInfo);
        const wb = XLSX.read(buf, { type: 'buffer' });
        const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        for (let i = 1; i < sheet.length; i++) {
          const sku = sheet[i][5];
          const yuan = sheet[i][8];
          if (sku && yuan != null) yuanMap[String(sku)] = Number(yuan);
        }
      }
    } catch (e) {
      console.error('[위안화] 로드 실패:', e.message);
    }

    // SKU별 평균 원가 + 최근 5건 평균 비율
    let skuAvgCost = {};
    let recent5AvgRatio = null;
    try {
      if (fs.existsSync(PATHS.allData)) {
        const allData = JSON.parse(fs.readFileSync(PATHS.allData, 'utf8'));
        const skuCosts = {};
        for (const entry of Object.values(allData)) {
          if (!entry.rows) continue;
          for (const r of entry.rows) {
            if (r.sku && r.costPerUnit) {
              if (!skuCosts[r.sku]) skuCosts[r.sku] = [];
              skuCosts[r.sku].push(r.costPerUnit);
            }
          }
        }
        for (const [sku, costs] of Object.entries(skuCosts)) {
          skuAvgCost[sku] = Math.round(costs.reduce((s, c) => s + c, 0) / costs.length);
        }

        const shipments = Object.entries(allData)
          .map(([key, entry]) => {
            const dm = key.match(/\d{6}/);
            return { key, dateNum: dm ? parseInt(dm[0]) : 0, rows: entry.rows || [] };
          })
          .filter(s => s.dateNum > 0)
          .sort((a, b) => b.dateNum - a.dateNum)
          .slice(0, 5);

        const allRatios = [];
        const detail = [];
        for (const s of shipments) {
          const ratios = [];
          for (const r of s.rows) {
            if (r.unitPriceCny > 0 && r.costPerUnit > 0) {
              const ratio = r.costPerUnit / r.unitPriceCny;
              allRatios.push(ratio);
              ratios.push(ratio);
            }
          }
          if (ratios.length > 0) {
            detail.push({ key: s.key, avg: Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length * 100) / 100 });
          }
        }
        if (allRatios.length > 0) {
          recent5AvgRatio = {
            avg: Math.round(allRatios.reduce((s, r) => s + r, 0) / allRatios.length * 100) / 100,
            detail,
          };
        }
      }
    } catch (e) {
      console.error('[원가평균] 로드 실패:', e.message);
    }

    return NextResponse.json({
      success: true,
      data: result,
      yuanMap,
      skuAvgCost,
      recent5AvgRatio,
      parsed: {
        excel: { itemCount: excelData.items.length, totals: excelData.totals, boxCount: excelData.boxCount, boxCount2: excelData.boxCount2, shipmentCode: excelData.shipmentCode },
        invoice: invoiceData ? {
          blNo: invoiceData.blNo, cbm: invoiceData.cbm, weight: invoiceData.weight,
          packages: invoiceData.packages, costs: invoiceData.costs,
          exchangeRateCNY: invoiceData.exchangeRateCNY, totalAmount: invoiceData.totalAmount,
        } : null,
        declaration: declarationData ? {
          declarationNo: declarationData.declarationNo, blNo: declarationData.blNo,
          exchangeRate: declarationData.exchangeRate,
          totalCustomsDuty: declarationData.totalCustomsDuty, totalVat: declarationData.totalVat,
          itemCount: declarationData.items.length,
        } : null,
      },
    });
  } catch (error) {
    console.error('Calculation error:', error);
    return NextResponse.json({ error: `계산 오류: ${error.message}` }, { status: 500 });
  }
}
