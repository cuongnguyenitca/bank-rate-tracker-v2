// =====================================================
// Xuất báo cáo PDF và Word cho bảng lãi suất tiền gửi
// =====================================================

import type { Bank } from './types';
import { VALID_TERMS, TERM_SHORT } from './termMapping';
import { formatDate } from './utils';

interface CellData {
  min: number | null;
  max: number | null;
  hasPolicy: boolean;
  policyNote: string;
}

type GetCellDataFn = (bankId: number, custType: string, termCode: string) => CellData;

function fmtRate(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return value.toFixed(2).replace('.', ',').replace(/,?0+$/, '').replace(/,$/, '');
}

function fmtRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return '-';
  if (min === null) return fmtRate(max);
  if (max === null) return fmtRate(min);
  if (min === max) return fmtRate(min);
  return `${fmtRate(min)}-${fmtRate(max)}`;
}

const GROUP_LABELS: Record<string, string> = {
  'NHTMNN': 'Nhom NHTM Nha nuoc',
  'NHTMCP_LON': 'Nhom NHTMCP lon',
  'NHTMCP_TB': 'Nhom NHTMCP trung binh',
};

// =====================================================
// XUẤT PDF
// =====================================================
export async function exportDepositRatesPDF(
  banks: Bank[],
  getCellData: GetCellDataFn,
  selectedDate: string
) {
  const jsPDF = (await import('jspdf')).default;
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Title
  doc.setFontSize(14);
  doc.text('BANG TONG HOP LAI SUAT TIEN GUI', 148, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Ngay: ${formatDate(selectedDate)} - Don vi: %/nam`, 148, 18, { align: 'center' });

  const groups = [
    { key: 'NHTMNN', banks: banks.filter(b => b.group_type === 'NHTMNN') },
    { key: 'NHTMCP_LON', banks: banks.filter(b => b.group_type === 'NHTMCP_LON') },
    { key: 'NHTMCP_TB', banks: banks.filter(b => b.group_type === 'NHTMCP_TB') },
  ];

  const headers = [['Ngan hang', '', ...VALID_TERMS.map(t => TERM_SHORT[t])]];
  const body: any[][] = [];

  for (const group of groups) {
    // Group header row
    body.push([{ content: GROUP_LABELS[group.key], colSpan: VALID_TERMS.length + 2, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }]);

    for (const bank of group.banks) {
      // CN row
      const cnCells = VALID_TERMS.map(t => {
        const cell = getCellData(bank.id, 'CN', t);
        return fmtRange(cell.min, cell.max);
      });
      body.push([bank.name, 'CN', ...cnCells]);

      // TCKT row
      const tcktCells = VALID_TERMS.map(t => {
        const cell = getCellData(bank.id, 'TCKT', t);
        return fmtRange(cell.min, cell.max);
      });
      body.push(['', 'TCKT', ...tcktCells]);
    }
  }

  autoTable(doc, {
    startY: 22,
    head: headers,
    body: body,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', font: 'helvetica' },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { halign: 'left', cellWidth: 28 },
      1: { cellWidth: 12 },
    },
    didParseCell: function (data: any) {
      // Bold bank name
      if (data.column.index === 0 && data.cell.raw && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(
      `He thong theo doi lai suat Ngan hang - Xuat luc ${new Date().toLocaleString('vi-VN')}`,
      148, 200, { align: 'center' }
    );
  }

  doc.save(`lai-suat-tien-gui-${selectedDate}.pdf`);
}

// =====================================================
// XUẤT WORD
// =====================================================
export async function exportDepositRatesWord(
  banks: Bank[],
  getCellData: GetCellDataFn,
  selectedDate: string
) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType } = docx;

  const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 40, bottom: 40, left: 60, right: 60 };

  function hCell(text: string, width: number) {
    return new TableCell({
      borders, width: { size: width, type: WidthType.DXA },
      shading: { fill: '1e3a5f', type: ShadingType.CLEAR },
      margins,
      children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', font: 'Arial', size: 16 })] })],
    });
  }

  function dCell(text: string, width: number, opts: { bold?: boolean; fill?: string } = {}) {
    return new TableCell({
      borders, width: { size: width, type: WidthType.DXA },
      shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
      margins,
      children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, font: 'Arial', size: 16, bold: opts.bold })] })],
    });
  }

  function leftCell(text: string, width: number, opts: { bold?: boolean; fill?: string } = {}) {
    return new TableCell({
      borders, width: { size: width, type: WidthType.DXA },
      shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
      margins,
      children: [new Paragraph({
        children: [new TextRun({ text, font: 'Arial', size: 16, bold: opts.bold })] })],
    });
  }

  // Column widths (landscape A4)
  const colBank = 1800;
  const colType = 600;
  const colRate = 900;
  const totalWidth = colBank + colType + colRate * VALID_TERMS.length;

  // Header row
  const headerRow = new TableRow({
    children: [
      hCell('Ngan hang', colBank),
      hCell('', colType),
      ...VALID_TERMS.map(t => hCell(TERM_SHORT[t], colRate)),
    ],
  });

  const rows: any[] = [headerRow];

  const groups = [
    { key: 'NHTMNN', banks: banks.filter(b => b.group_type === 'NHTMNN') },
    { key: 'NHTMCP_LON', banks: banks.filter(b => b.group_type === 'NHTMCP_LON') },
    { key: 'NHTMCP_TB', banks: banks.filter(b => b.group_type === 'NHTMCP_TB') },
  ];

  for (const group of groups) {
    // Group header
    const groupCells = [
      new TableCell({
        borders, width: { size: totalWidth, type: WidthType.DXA },
        shading: { fill: 'E6E6E6', type: ShadingType.CLEAR },
        margins,
        columnSpan: VALID_TERMS.length + 2,
        children: [new Paragraph({
          children: [new TextRun({ text: GROUP_LABELS[group.key], font: 'Arial', size: 16, bold: true })] })],
      }),
    ];
    rows.push(new TableRow({ children: groupCells }));

    for (const bank of group.banks) {
      // CN row
      const cnRow = new TableRow({
        children: [
          leftCell(bank.name, colBank, { bold: true }),
          dCell('CN', colType),
          ...VALID_TERMS.map(t => {
            const cell = getCellData(bank.id, 'CN', t);
            return dCell(fmtRange(cell.min, cell.max), colRate);
          }),
        ],
      });
      rows.push(cnRow);

      // TCKT row
      const tcktRow = new TableRow({
        children: [
          leftCell('', colBank),
          dCell('TCKT', colType),
          ...VALID_TERMS.map(t => {
            const cell = getCellData(bank.id, 'TCKT', t);
            return dCell(fmtRange(cell.min, cell.max), colRate);
          }),
        ],
      });
      rows.push(tcktRow);
    }
  }

  const table = new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: [colBank, colType, ...VALID_TERMS.map(() => colRate)],
    rows,
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 16838, height: 11906, orientation: docx.PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: 'BANG TONG HOP LAI SUAT TIEN GUI', bold: true, font: 'Arial', size: 28 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: `Ngay: ${formatDate(selectedDate)} - Don vi: %/nam`, font: 'Arial', size: 20, color: '666666' })] }),
        table,
        new Paragraph({ spacing: { before: 200 },
          children: [new TextRun({ text: `Xuat luc: ${new Date().toLocaleString('vi-VN')} - He thong theo doi lai suat Ngan hang`, font: 'Arial', size: 14, color: '999999', italics: true })] }),
      ],
    }],
  });

  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lai-suat-tien-gui-${selectedDate}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
