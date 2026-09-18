"use client";

import type { Font as FontkitFont } from "@pdf-lib/fontkit";

/**
 * 브라우저 PDF 생성(수료증·연구모임 제출본)이 공유하는 한글 폰트 로더.
 *
 * 폰트는 반드시 public/fonts/의 가공본(scripts/process_cert_fonts.py 산출물)을 쓴다.
 * @pdf-lib/fontkit의 TTFSubset은 홀수 길이 글리프 뒤에 패딩을 넣지 않아 short-loca
 * 서브셋이 1바이트씩 밀리며 글자가 깨진다 — 가공본은 모든 글리프를 짝수 길이로
 * 패딩(glyf.padding=2)해 이 버그를 원천 회피한다. 원본 CDN TTF를 그대로 쓰면 안 된다.
 *
 * 정적 export(GitHub Pages 서브패스)라 fetch 경로에 basePath를 직접 붙인다.
 */
const FONT_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const FONT_REGULAR_URL = `${FONT_BASE}/fonts/NotoSansKR-Regular-Cert.ttf`;
const FONT_BOLD_URL = `${FONT_BASE}/fonts/NotoSansKR-Bold-Cert.ttf`;

export interface KoreanFontBytes {
  regular: ArrayBuffer;
  bold: ArrayBuffer;
}

let cachedFonts: KoreanFontBytes | null = null;
// fontkit.create는 Buffer.from으로 2.4MB를 복사하므로 파싱 결과도 함께 캐시한다.
let cachedGlyphSource: FontkitFont | null = null;

export async function loadKoreanFonts(): Promise<KoreanFontBytes> {
  if (cachedFonts) return cachedFonts;
  const [regular, bold] = await Promise.all([
    fetch(FONT_REGULAR_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_BOLD_URL).then((r) => r.arrayBuffer()),
  ]);
  cachedFonts = { regular, bold };
  return cachedFonts;
}

/** 서브셋 폰트에 없는 문자를 대신할 글리프. Cert 폰트에 □가 없으면 Basic Latin의 ?로 물러난다. */
const REPLACEMENT_PREFERRED = 0x25a1; // □
const REPLACEMENT_FALLBACK = "?";

/**
 * 글리프 유무를 판정할 수 있는 폰트 객체. Regular·Bold는 같은 서브셋 범위로 가공되므로
 * Regular 하나만 파싱해 둘 다에 적용한다.
 */
export async function loadGlyphSource(): Promise<FontkitFont> {
  if (cachedGlyphSource) return cachedGlyphSource;
  const [{ default: fontkit }, fonts] = await Promise.all([
    import("@pdf-lib/fontkit"),
    loadKoreanFonts(),
  ]);
  cachedGlyphSource = fontkit.create(new Uint8Array(fonts.regular));
  return cachedGlyphSource;
}

// 제로폭·서식 문자 — 보이지 않는 글자를 대체 글리프로 바꾸면 오히려 얼룩이 생기므로 제거한다.
const INVISIBLE_RE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\uFE0E\uFE0F]/g;

/**
 * PDF에 그리기 전 문자열 정리.
 *
 * pdf-lib은 폰트에 없는 문자를 오류 없이 .notdef(빈 글리프)로 그려 글자가 소리 없이 사라진다.
 * 이모지·한자·서브셋 밖 기호는 눈에 보이는 대체 글리프로 바꿔 누락을 알 수 있게 한다.
 * 줄바꿈(\n)은 cmap에 없는 제어문자라 검사에서 제외하고, \r\n과 \t는 pdf-lib이 폭 측정과
 * 그리기에서 다르게 다루므로 여기서 먼저 정규화한다.
 */
export function sanitizeForFont(text: string, font: FontkitFont): string {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").replace(INVISIBLE_RE, "");
  const replacement = font.hasGlyphForCodePoint(REPLACEMENT_PREFERRED)
    ? String.fromCodePoint(REPLACEMENT_PREFERRED)
    : REPLACEMENT_FALLBACK;

  let out = "";
  for (const ch of normalized) {
    if (ch === "\n") {
      out += ch;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    out += font.hasGlyphForCodePoint(cp) ? ch : replacement;
  }
  return out;
}
