"use client";

import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";
import type { Font as FontkitFont } from "@pdf-lib/fontkit";
import { formatCertIssueDate, formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { loadGlyphSource, loadKoreanFonts, sanitizeForFont } from "@/lib/pdfFonts";
import {
  STUDY_APPLY_SIGNATURE,
  STUDY_CATEGORY_FALLBACK,
  STUDY_CONSENT_ITEMS,
  STUDY_EDUCATION_MODES,
  STUDY_HOST,
  STUDY_PLAN_SECTIONS,
  STUDY_PROGRAM_NAME,
  STUDY_PROGRESS_METHODS,
  STUDY_SIGNATURE_ADDRESSEE,
  STUDY_WORKSHOP_OPTIONS,
  STUDY_WORKSHOP_STEPS,
} from "@/lib/studyGroupConstants";
import {
  STUDY_STATUS_LABELS,
  type StudyGroupStatus,
  type StudyGroupWithRelations,
  type StudyIdentity,
  type StudyLookupResult,
  type WorkshopPreference,
} from "@/lib/studyTypes";
import { formatWorkshopSlot, getWorkshopSlot } from "@/lib/workshopPref";

/**
 * [서식 1] 신청서·연구계획서 제출본 PDF.
 *
 * 관리자(StudyGroupWithRelations)와 대표자(StudyLookupResult)가 같은 문서를 받도록
 * 두 shape를 이 한 가지로 정규화한 뒤 그린다. 수료증과 같이 브라우저에서 생성하며
 * pdf-lib·fontkit은 버튼을 누를 때만 동적 import한다.
 *
 * 서식의 조판 지침(본문 12pt·줄간격 160%)은 그대로 따르되, 서체는 저장소에 있는
 * Noto Sans KR 가공본을 쓴다(굴림은 배포할 수 없다).
 */
export interface StudyFormPdfData {
  code: string;
  name: string;
  topic: string;
  category: string;
  status: StudyGroupStatus;
  leader: {
    name: string;
    affiliation: string;
    position: string;
    idNumber: string;
    phone?: string;
    email: string;
  };
  periodStart: string;
  periodEnd: string;
  memberCount: number;
  isMultiDept: boolean;
  hasNontenured: boolean;
  progressMethod: string | null;
  educationMode: string | null;
  members: { idNumber: string; name: string; affiliation: string; position: string; isLeader: boolean }[];
  /** 신청자 조회 응답에는 없으므로 관리자 경로에서만 채워진다. */
  ethicsPledges?: { no: number; title: string; pledge: string }[];
  plan: {
    section1Topic: string;
    section2Purpose: string;
    section3Platform: string;
    section4Effect: string;
    section5Etc: string;
    workshopPref: WorkshopPreference;
    charCount: number;
    submittedAt: string | null;
  } | null;
  submittedAt: string | null;
  createdAt: string;
}

export function adminGroupToPdfData(g: StudyGroupWithRelations): StudyFormPdfData {
  return {
    code: g.code,
    name: g.name,
    topic: g.topic,
    category: g.category,
    status: g.status,
    leader: {
      name: g.leader_name,
      affiliation: g.leader_affiliation,
      position: g.leader_position,
      idNumber: g.leader_id_number,
      phone: formatPhone(g.leader_phone),
      email: g.leader_email,
    },
    periodStart: g.period_start,
    periodEnd: g.period_end,
    memberCount: g.member_count,
    isMultiDept: g.is_multi_dept,
    hasNontenured: g.has_nontenured,
    progressMethod: g.progress_method,
    educationMode: g.education_mode,
    members: [...g.members]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        idNumber: m.id_number,
        name: m.name,
        affiliation: m.affiliation,
        position: m.position,
        isLeader: m.is_leader,
      })),
    ethicsPledges: g.ethics_pledges ?? [],
    plan: g.plan
      ? {
          section1Topic: g.plan.section1_topic,
          section2Purpose: g.plan.section2_purpose,
          section3Platform: g.plan.section3_platform,
          section4Effect: g.plan.section4_effect,
          section5Etc: g.plan.section5_etc,
          workshopPref: g.plan.workshop_pref ?? {},
          charCount: g.plan.char_count,
          submittedAt: g.plan.submitted_at,
        }
      : null,
    submittedAt: g.submitted_at,
    createdAt: g.created_at,
  };
}

/** 연락처는 조회 응답에 없어 본인확인에 쓴 신원(identity)에서 가져온다. */
export function lookupGroupToPdfData(g: StudyLookupResult, identity?: StudyIdentity): StudyFormPdfData {
  return {
    code: g.code,
    name: g.name,
    topic: g.topic,
    category: g.category,
    status: g.status,
    leader: {
      name: g.leaderName,
      affiliation: g.leaderAffiliation,
      position: g.leaderPosition,
      idNumber: g.leaderIdNumber,
      phone: identity ? formatPhone(identity.leaderPhone) : undefined,
      email: g.leaderEmail,
    },
    periodStart: g.periodStart,
    periodEnd: g.periodEnd,
    memberCount: g.memberCount,
    isMultiDept: g.isMultiDept,
    hasNontenured: g.hasNontenured,
    progressMethod: g.progressMethod,
    educationMode: g.educationMode,
    members: [...g.members]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({
        idNumber: m.idNumber,
        name: m.name,
        affiliation: m.affiliation,
        position: m.position,
        isLeader: m.isLeader,
      })),
    plan: g.plan
      ? {
          section1Topic: g.plan.section1Topic,
          section2Purpose: g.plan.section2Purpose,
          section3Platform: g.plan.section3Platform,
          section4Effect: g.plan.section4Effect,
          section5Etc: g.plan.section5Etc,
          workshopPref: g.plan.workshopPref ?? {},
          charCount: g.plan.charCount,
          submittedAt: g.plan.submittedAt,
        }
      : null,
    submittedAt: g.submittedAt,
    createdAt: g.createdAt,
  };
}

export function studyPdfFilename(code: string, kind: "application" | "plan"): string {
  return `${code}_${kind === "application" ? "신청서" : "연구계획서"}.pdf`;
}

// ---------------------------------------------------------------------------
// 레이아웃 도우미 — A4 세로, 커서 기반 흐름 배치, 표 셀 줄바꿈, 자동 페이지 넘김
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const FOOTER_SPACE = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 12;
const BODY_LINE_HEIGHT = 1.6;
const CELL_PADDING = 5;

interface TextStyle {
  size?: number;
  lineHeight?: number;
  bold?: boolean;
  color?: RGB;
  align?: "left" | "center" | "right";
}

interface KvRow {
  label: string;
  value: string;
}

interface GridColumn {
  header: string;
  /** CONTENT_WIDTH에 대한 비율(합이 1) */
  ratio: number;
  align?: "left" | "center";
}

class PdfWriter {
  private page!: PDFPage;
  /** 다음 줄 상자의 윗변(pdf 좌표, 아래가 0) */
  private y = 0;
  private readonly gray: RGB;
  private readonly lightGray: RGB;
  private readonly black: RGB;
  private readonly muted: RGB;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: { regular: PDFFont; bold: PDFFont },
    private readonly rgb: (r: number, g: number, b: number) => RGB,
    private readonly glyphs: FontkitFont,
    private readonly footerLabel: string
  ) {
    this.black = rgb(0.1, 0.1, 0.1);
    this.muted = rgb(0.4, 0.4, 0.4);
    this.gray = rgb(0.6, 0.6, 0.6);
    this.lightGray = rgb(0.94, 0.94, 0.94);
    this.newPage();
  }

  get mutedColor(): RGB {
    return this.muted;
  }

  private font(bold?: boolean): PDFFont {
    return bold ? this.fonts.bold : this.fonts.regular;
  }

  private clean(text: string): string {
    return sanitizeForFont(text ?? "", this.glyphs);
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** 남은 공간이 h보다 작으면 다음 페이지로 넘긴다. */
  ensure(h: number): boolean {
    if (this.y - h < MARGIN + FOOTER_SPACE) {
      this.newPage();
      return true;
    }
    return false;
  }

  space(h: number): void {
    this.y -= h;
  }

  /**
   * 폭에 맞춰 줄을 나눈다. 한국어는 공백이 드물어 문자 단위로 끊되, 직전 공백이 있으면
   * 거기서 끊어 영문 단어가 갈라지지 않게 한다. 입력은 이미 정리된(clean) 문자열이어야 한다.
   */
  wrap(text: string, size: number, maxWidth: number, bold?: boolean): string[] {
    const font = this.font(bold);
    const out: string[] = [];
    for (const raw of text.split("\n")) {
      if (raw === "") {
        out.push("");
        continue;
      }
      let line = "";
      let lineWidth = 0;
      let lastSpace = -1;
      for (const ch of Array.from(raw)) {
        const w = font.widthOfTextAtSize(ch, size);
        if (lineWidth + w > maxWidth && line.length > 0) {
          if (lastSpace > 0 && ch !== " ") {
            const head = line.slice(0, lastSpace);
            const tail = line.slice(lastSpace + 1) + ch;
            out.push(head);
            line = tail;
            lineWidth = font.widthOfTextAtSize(line, size);
            lastSpace = line.lastIndexOf(" ");
          } else {
            out.push(line);
            line = ch === " " ? "" : ch;
            lineWidth = ch === " " ? 0 : w;
            lastSpace = -1;
          }
          continue;
        }
        line += ch;
        lineWidth += w;
        if (ch === " ") lastSpace = line.length - 1;
      }
      out.push(line);
    }
    return out;
  }

  /** 줄 상자 윗변(top)을 기준으로 한 줄을 그린다. */
  private drawLine(text: string, x: number, top: number, width: number, style: TextStyle): void {
    if (!text) return;
    const size = style.size ?? BODY_SIZE;
    const lh = style.lineHeight ?? BODY_LINE_HEIGHT;
    const font = this.font(style.bold);
    const textWidth = font.widthOfTextAtSize(text, size);
    const dx =
      style.align === "center" ? (width - textWidth) / 2 : style.align === "right" ? width - textWidth : 0;
    // 상자 높이 size*lh 안에서 위아래 여백을 균등 분배하고 어센트만큼 내려 베이스라인을 잡는다.
    const baseline = top - (size * (lh - 1)) / 2 - size * 0.86;
    this.page.drawText(text, {
      x: x + dx,
      y: baseline,
      size,
      font,
      color: style.color ?? this.black,
    });
  }

  /** 문단. 줄 단위로 페이지를 넘긴다. */
  paragraph(text: string, style: TextStyle = {}, opts: { gapAfter?: number; indent?: number } = {}): void {
    const size = style.size ?? BODY_SIZE;
    const lh = style.lineHeight ?? BODY_LINE_HEIGHT;
    const box = size * lh;
    const indent = opts.indent ?? 0;
    const width = CONTENT_WIDTH - indent;
    const lines = this.wrap(this.clean(text), size, width, style.bold);
    for (const line of lines) {
      this.ensure(box);
      this.drawLine(line, MARGIN + indent, this.y, width, { ...style, size, lineHeight: lh });
      this.y -= box;
    }
    this.y -= opts.gapAfter ?? 0;
  }

  /** 소제목. 뒤따르는 본문 두 줄이 같은 페이지에 들어갈 공간까지 확보해 제목만 남는 고아를 막는다. */
  heading(text: string, size = 13): void {
    this.ensure(size * 1.5 + BODY_SIZE * BODY_LINE_HEIGHT * 2 + 4);
    this.paragraph(text, { size, bold: true, lineHeight: 1.5 }, { gapAfter: 2 });
  }

  /** 서식형 표 — 왼쪽 라벨 셀(회색 배경) + 오른쪽 값 셀. 값이 길면 행 높이가 늘어난다. */
  kvTable(rows: KvRow[], opts: { labelWidth?: number; size?: number } = {}): void {
    const size = opts.size ?? 11;
    const lh = 1.5;
    const box = size * lh;
    const labelWidth = opts.labelWidth ?? 120;
    const valueWidth = CONTENT_WIDTH - labelWidth;

    for (const row of rows) {
      const label = this.clean(row.label);
      const value = this.clean(row.value || "");
      const labelLines = this.wrap(label, size, labelWidth - CELL_PADDING * 2, true);
      const valueLines = this.wrap(value, size, valueWidth - CELL_PADDING * 2);
      const lineCount = Math.max(1, labelLines.length, valueLines.length);
      const rowHeight = lineCount * box + CELL_PADDING * 2;
      this.ensure(rowHeight);

      const top = this.y;
      const bottom = top - rowHeight;
      this.page.drawRectangle({
        x: MARGIN,
        y: bottom,
        width: labelWidth,
        height: rowHeight,
        color: this.lightGray,
        borderColor: this.gray,
        borderWidth: 0.6,
      });
      this.page.drawRectangle({
        x: MARGIN + labelWidth,
        y: bottom,
        width: valueWidth,
        height: rowHeight,
        borderColor: this.gray,
        borderWidth: 0.6,
      });

      let ly = top - CELL_PADDING;
      for (const line of labelLines) {
        this.drawLine(line, MARGIN + CELL_PADDING, ly, labelWidth - CELL_PADDING * 2, {
          size,
          lineHeight: lh,
          bold: true,
        });
        ly -= box;
      }
      let vy = top - CELL_PADDING;
      for (const line of valueLines) {
        this.drawLine(line, MARGIN + labelWidth + CELL_PADDING, vy, valueWidth - CELL_PADDING * 2, {
          size,
          lineHeight: lh,
        });
        vy -= box;
      }
      this.y = bottom;
    }
  }

  /** 열 머리글이 있는 표. 페이지가 넘어가면 머리글을 다시 그린다. */
  grid(columns: GridColumn[], rows: string[][], opts: { size?: number } = {}): void {
    const size = opts.size ?? 10.5;
    const lh = 1.5;
    const box = size * lh;
    const widths = columns.map((c) => c.ratio * CONTENT_WIDTH);

    const drawHeader = () => {
      const height = box + CELL_PADDING * 2;
      this.ensure(height);
      const top = this.y;
      let x = MARGIN;
      columns.forEach((col, i) => {
        this.page.drawRectangle({
          x,
          y: top - height,
          width: widths[i],
          height,
          color: this.lightGray,
          borderColor: this.gray,
          borderWidth: 0.6,
        });
        this.drawLine(this.clean(col.header), x + CELL_PADDING, top - CELL_PADDING, widths[i] - CELL_PADDING * 2, {
          size,
          lineHeight: lh,
          bold: true,
          align: "center",
        });
        x += widths[i];
      });
      this.y = top - height;
    };

    drawHeader();
    for (const row of rows) {
      const cells = columns.map((col, i) =>
        this.wrap(this.clean(row[i] ?? ""), size, widths[i] - CELL_PADDING * 2)
      );
      const lineCount = Math.max(1, ...cells.map((c) => c.length));
      const rowHeight = lineCount * box + CELL_PADDING * 2;
      if (this.ensure(rowHeight)) drawHeader();

      const top = this.y;
      let x = MARGIN;
      columns.forEach((col, i) => {
        this.page.drawRectangle({
          x,
          y: top - rowHeight,
          width: widths[i],
          height: rowHeight,
          borderColor: this.gray,
          borderWidth: 0.6,
        });
        let cy = top - CELL_PADDING;
        for (const line of cells[i]) {
          this.drawLine(line, x + CELL_PADDING, cy, widths[i] - CELL_PADDING * 2, {
            size,
            lineHeight: lh,
            align: col.align ?? "left",
          });
          cy -= box;
        }
        x += widths[i];
      });
      this.y = top - rowHeight;
    }
  }

  /** 문서 제목 블록 — 제목·부제·메타 한 줄 */
  title(main: string, sub: string, meta: string): void {
    this.paragraph(main, { size: 18, bold: true, lineHeight: 1.4, align: "center" }, { gapAfter: 2 });
    this.paragraph(sub, { size: 10, lineHeight: 1.4, align: "center", color: this.muted }, { gapAfter: 6 });
    this.paragraph(meta, { size: 9.5, lineHeight: 1.4, align: "right", color: this.muted }, { gapAfter: 8 });
  }

  /** 서명란 — 서식 원문의 제출 문구·일자·대표자·수신처. 한 덩어리로 페이지에 들어가게 한다. */
  signature(dateText: string, leaderName: string): void {
    const size = 11;
    const box = size * 1.8;
    this.ensure(box * 4 + 24);
    this.y -= 12;
    this.paragraph(STUDY_APPLY_SIGNATURE, { size, lineHeight: 1.8, align: "center" });
    this.paragraph(dateText, { size, lineHeight: 1.8, align: "center" });
    this.paragraph(`대표자  ${leaderName}  (서명 또는 인)`, { size, lineHeight: 1.8, align: "center" });
    this.paragraph(STUDY_SIGNATURE_ADDRESSEE, { size: 12, bold: true, lineHeight: 1.8, align: "center" });
  }

  /** 모든 페이지 하단에 접수번호·쪽수를 찍는다. 총 쪽수는 다 그린 뒤에야 알 수 있어 마지막에 돈다. */
  finalizeFooters(): void {
    const pages = this.doc.getPages();
    const total = pages.length;
    const label = this.clean(this.footerLabel);
    pages.forEach((page, index) => {
      const text = `${label}  ·  ${index + 1} / ${total}`;
      const size = 8.5;
      const width = this.fonts.regular.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (PAGE_WIDTH - width) / 2,
        y: MARGIN - 14,
        size,
        font: this.fonts.regular,
        color: this.gray,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// 공통 준비
// ---------------------------------------------------------------------------

async function createWriter(footerLabel: string): Promise<{ writer: PdfWriter; doc: PDFDocument }> {
  const [{ PDFDocument, rgb }, { default: fontkit }, fonts, glyphs] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    loadKoreanFonts(),
    loadGlyphSource(),
  ]);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  doc.setTitle(footerLabel);
  doc.setProducer(STUDY_HOST);

  return { writer: new PdfWriter(doc, { regular, bold }, rgb, glyphs, footerLabel), doc };
}

function categoryLabel(key: string): string {
  const def = STUDY_CATEGORY_FALLBACK.find((c) => c.key === key);
  return def ? `[${def.key}] ${def.label}` : `[${key}]`;
}

function progressMethodLabel(key: string | null): string {
  return STUDY_PROGRESS_METHODS.find((m) => m.key === key)?.label ?? "미선택";
}

function educationModeLabel(key: string | null): string {
  return STUDY_EDUCATION_MODES.find((m) => m.key === key)?.label ?? "미선택";
}

/** 날짜 문자열(YYYY-MM-DD 또는 ISO)을 서식 표기로. 비어 있거나 잘못됐으면 대시. */
function safeDate(value: string | null | undefined): string {
  if (!value) return "–";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? formatDate(value) : "–";
}

function memberRows(data: StudyFormPdfData): string[][] {
  return data.members.map((m, index) => [
    String(index + 1),
    m.idNumber,
    m.name,
    m.affiliation,
    m.position,
    m.isLeader ? "대표자" : "",
  ]);
}

const MEMBER_COLUMNS: GridColumn[] = [
  { header: "연번", ratio: 0.08, align: "center" },
  { header: "직(학)번", ratio: 0.17, align: "center" },
  { header: "성명", ratio: 0.15, align: "center" },
  { header: "소속", ratio: 0.34 },
  { header: "직급", ratio: 0.14, align: "center" },
  { header: "비고", ratio: 0.12, align: "center" },
];

// ---------------------------------------------------------------------------
// 신청서 ([서식 1] 상단 + 참여자 + 윤리 다짐 + 서명란)
// ---------------------------------------------------------------------------

export async function buildStudyApplicationPdf(data: StudyFormPdfData): Promise<Uint8Array> {
  const { writer, doc } = await createWriter(`${data.code} 신청서`);

  writer.title(
    "[서식 1] AI 활용 연구모임 신청서",
    `${STUDY_PROGRAM_NAME} · ${STUDY_HOST}`,
    `접수번호 ${data.code} · ${STUDY_STATUS_LABELS[data.status]}`
  );

  const memberNote = [
    `${data.memberCount}명`,
    data.isMultiDept ? "복수 학과 구성" : null,
    data.hasNontenured ? "비전임 교원 포함" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  writer.kvTable([
    { label: "모임명", value: data.name },
    { label: "주제", value: data.topic },
    { label: "수준별 카테고리", value: categoryLabel(data.category) },
    { label: "대표자 소속", value: data.leader.affiliation },
    { label: "대표자 직급", value: data.leader.position },
    { label: "대표자 성명", value: data.leader.name },
    { label: "대표자 직(학)번", value: data.leader.idNumber },
    { label: "연락처", value: data.leader.phone ?? "–" },
    { label: "이메일", value: data.leader.email },
    { label: "연구기간", value: `${safeDate(data.periodStart)} ~ ${safeDate(data.periodEnd)}` },
    { label: "참여인원", value: memberNote },
    { label: "진행방법", value: progressMethodLabel(data.progressMethod) },
    { label: "교육형태", value: educationModeLabel(data.educationMode) },
  ]);

  writer.space(14);
  writer.heading(`참여자 명단 (${data.members.length}명)`);
  writer.grid(MEMBER_COLUMNS, memberRows(data));

  if (data.ethicsPledges && data.ethicsPledges.length > 0) {
    writer.space(14);
    writer.heading("AI 윤리교육 실천 다짐 (GNU 생성형 AI 윤리 가이드라인 8대 핵심원칙)");
    for (const p of data.ethicsPledges) {
      writer.heading(`${p.no}. ${p.title}`, 11);
      writer.paragraph(p.pledge, { size: 11, lineHeight: 1.5 }, { gapAfter: 6, indent: 12 });
    }
  }

  writer.signature(formatCertIssueDate(data.submittedAt ?? data.createdAt), data.leader.name);

  writer.space(18);
  writer.paragraph("개인정보 수집·이용 동의 (신청 시 전자 동의)", {
    size: 9,
    bold: true,
    lineHeight: 1.5,
    color: writer.mutedColor,
  });
  for (const item of STUDY_CONSENT_ITEMS) {
    writer.paragraph(`· ${item}`, { size: 8.5, lineHeight: 1.45, color: writer.mutedColor });
  }

  writer.finalizeFooters();
  return doc.save();
}

// ---------------------------------------------------------------------------
// 연구계획서 ([서식 1] 하단 5개 항목 + 워크숍 희망일 + 서명란)
// ---------------------------------------------------------------------------

export async function buildStudyPlanPdf(data: StudyFormPdfData): Promise<Uint8Array> {
  const plan = data.plan;
  if (!plan) throw new Error("작성된 연구계획서가 없습니다.");

  const { writer, doc } = await createWriter(`${data.code} 연구계획서`);

  writer.title(
    "[서식 1] AI 활용 연구모임 연구계획서",
    `${STUDY_PROGRAM_NAME} · ${STUDY_HOST}`,
    `접수번호 ${data.code} · ${STUDY_STATUS_LABELS[data.status]}`
  );

  writer.kvTable(
    [
      { label: "모임명", value: data.name },
      { label: "대표자", value: `${data.leader.name} (${data.leader.affiliation} · ${data.leader.position})` },
      { label: "수준별 카테고리", value: categoryLabel(data.category) },
      { label: "연구기간", value: `${safeDate(data.periodStart)} ~ ${safeDate(data.periodEnd)}` },
    ],
    { labelWidth: 110, size: 10.5 }
  );

  writer.space(16);
  for (const section of STUDY_PLAN_SECTIONS) {
    const body = plan[section.key];
    writer.heading(`${section.no}. ${section.title}`);
    if (body.trim()) {
      writer.paragraph(body, { size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT }, { gapAfter: 12 });
    } else {
      writer.paragraph("(작성 내용 없음)", { size: BODY_SIZE, color: writer.mutedColor }, { gapAfter: 12 });
    }
  }

  writer.heading("단계별 워크숍 희망일·시작 시간");
  writer.grid(
    [
      { header: "단계", ratio: 0.34 },
      ...STUDY_WORKSHOP_OPTIONS.map((o) => ({
        header: o.label,
        ratio: 0.33,
        align: "center" as const,
      })),
    ],
    STUDY_WORKSHOP_STEPS.map((step) => [
      `${step.order}차 ${step.name} (${step.hours}시간) — ${step.detail}`,
      ...STUDY_WORKSHOP_OPTIONS.map((o) =>
        // 종료 시각은 단계별 시간(3H)으로 계산해 함께 적는다 — 강사 배정표를 그대로 옮겨 쓸 수 있게.
        formatWorkshopSlot(
          getWorkshopSlot(plan.workshopPref, o.key, step.key),
          step.hours,
          formatDate,
          "–"
        )
      ),
    ])
  );

  writer.space(12);
  writer.kvTable(
    [
      { label: "진행방법", value: progressMethodLabel(data.progressMethod) },
      { label: "교육형태", value: educationModeLabel(data.educationMode) },
    ],
    { labelWidth: 110, size: 10.5 }
  );

  writer.space(10);
  writer.paragraph(
    `공백 제외 ${plan.charCount.toLocaleString()}자 · ${
      plan.submittedAt ? `제출 ${formatDateTime(plan.submittedAt)}` : "임시저장본 (미제출)"
    }`,
    { size: 9.5, lineHeight: 1.5, color: writer.mutedColor, align: "right" }
  );

  writer.signature(formatCertIssueDate(plan.submittedAt ?? data.submittedAt ?? data.createdAt), data.leader.name);

  writer.finalizeFooters();
  return doc.save();
}
