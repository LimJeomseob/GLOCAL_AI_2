# 사용법:
#   pip install fonttools
#   python scripts/process_cert_fonts.py <원본.ttf> <출력.ttf> [--wght 400]
#   예) python scripts/process_cert_fonts.py "NotoSansKR[wght].ttf" public/fonts/NotoSansKR-Regular-Cert.ttf --wght 400
#       python scripts/process_cert_fonts.py "NotoSansKR[wght].ttf" public/fonts/NotoSansKR-Bold-Cert.ttf --wght 700
#
# Noto Sans KR을 브라우저 PDF 생성(수료증·연구모임 제출본)용으로 가공:
# 1) 한글 음절 전체 + 자모 + 라틴/문장부호 + 공문에 흔한 기호(○●□■ ①②③ ※ → ★ ✓ ㈜ 등)로 서브셋
# 2) 가변 폰트(glyf + gvar)면 요청한 굵기(--wght)로 정적 인스턴스화
#    → Google Fonts 배포본은 가변 TTF이며 기본값이 Thin(100)이라, 인스턴스화를 빠뜨리면
#      Regular·Bold 모두 Thin으로 나온다. 서브셋을 먼저 하는 이유는 24,964 글리프의
#      gvar 인스턴스화가 느리기 때문.
# 3) 복합(composite) 글리프를 단순 윤곽으로 평탄화
#    → @pdf-lib/fontkit 서브셋터의 복합 글리프 GID 재기록 버그를 원천 회피
# 4) 모든 글리프를 짝수 길이로 패딩(short-loca 오프셋 밀림 방지)
#
# 이 스크립트가 만든 파일만 public/fonts/에 둔다. 원본 TTF를 그대로 쓰면 안 된다(src/lib/pdfFonts.ts 참고).
import argparse
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

parser = argparse.ArgumentParser()
parser.add_argument("src")
parser.add_argument("dst")
parser.add_argument("--wght", type=int, default=None,
                    help="가변 폰트를 이 굵기로 고정한다(예: 400, 700). 정적 폰트면 생략.")
args = parser.parse_args()

font = TTFont(args.src)

opts = Options()
opts.layout_features = []          # GSUB/GPOS 기능 제거(단순 drawText 용도)
opts.hinting = False               # 힌팅 제거로 용량 절감
# STAT는 인스턴스화의 이름 갱신(updateFontNames)에 필요하므로 그 뒤에 지운다.
opts.drop_tables += ["BASE", "GDEF", "GPOS", "GSUB", "vhea", "vmtx", "gasp"]
subsetter = Subsetter(options=opts)
unicodes = []
unicodes += list(range(0x0020, 0x007F))   # Basic Latin
unicodes += list(range(0x00A0, 0x0100))   # Latin-1 보충(× ÷ ° ± ² ³ 등)
unicodes += list(range(0x2000, 0x2070))   # 일반 문장부호(– — ‘ ’ “ ” … ※ ‰ 등)
unicodes += list(range(0x2190, 0x2200))   # 화살표(→ ← ↔ ⇒ 등)
unicodes += list(range(0x2460, 0x2500))   # 원 숫자(① ② ③ …)
unicodes += list(range(0x25A0, 0x2600))   # 도형 기호(○ ● □ ■ ◇ ◆ △ ▲ 등)
unicodes += list(range(0x2600, 0x2700))   # 기타 기호(★ ☆ ☎ 등)
unicodes += list(range(0x2700, 0x27C0))   # 딩뱃(✓ ✔ ✗ 등)
unicodes += list(range(0x3000, 0x3040))   # CJK 기호/전각 공백·괄호
unicodes += list(range(0x3130, 0x3190))   # 한글 호환 자모
unicodes += list(range(0x3200, 0x3300))   # 괄호·원 한글/한자(㉠ ㈜ ㉾ 등)
unicodes += list(range(0xAC00, 0xD7A4))   # 한글 음절 전체(11,172자)
unicodes += list(range(0xFF01, 0xFFF0))   # 전각 영숫자/괄호·반각 가나·기호
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)

# 가변 폰트 → 정적 인스턴스
if "fvar" in font:
    if args.wght is None:
        raise SystemExit("가변 폰트입니다. --wght 400 또는 --wght 700을 지정하세요.")
    from fontTools.varLib import instancer
    font = instancer.instantiateVariableFont(font, {"wght": args.wght}, updateFontNames=True)
    # 인스턴스화가 남긴 가변 전용 테이블은 pdf-lib에 불필요하므로 제거한다.
    for tag in ("STAT", "MVAR", "HVAR", "VVAR", "avar", "fvar", "gvar", "cvar"):
        if tag in font:
            del font[tag]
    # 기본 인스턴스가 Thin이라 자동 갱신된 이름이 "NotoSansKRThin-Regular"처럼 나온다.
    # PDF의 BaseFont 표기에 쓰이므로 정적 폰트와 같은 이름으로 맞춘다.
    style = {400: "Regular", 700: "Bold"}.get(args.wght, f"W{args.wght}")
    name_table = font["name"]
    name_table.names = [n for n in name_table.names if n.nameID not in (1, 2, 3, 4, 6, 16, 17)]
    for platform, encoding, lang in ((3, 1, 0x409), (1, 0, 0)):
        name_table.setName("Noto Sans KR", 1, platform, encoding, lang)
        name_table.setName(style, 2, platform, encoding, lang)
        name_table.setName(f"Noto Sans KR {style}", 4, platform, encoding, lang)
        name_table.setName(f"NotoSansKR-{style}", 6, platform, encoding, lang)
else:
    if args.wght is not None:
        print("정적 폰트라 --wght는 무시합니다.")
    if "STAT" in font:
        del font["STAT"]

# 복합 글리프 평탄화
glyf = font["glyf"]
glyph_set = font.getGlyphSet()
flattened = 0
for name in font.getGlyphOrder():
    glyph = glyf[name]
    if glyph.isComposite():
        pen = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(pen)
        tpen = TTGlyphPen(None)
        pen.replay(tpen)
        glyf[name] = tpen.glyph()
        flattened += 1

# 평탄화 후 남은 복합 글리프 확인
remaining = sum(1 for n in font.getGlyphOrder() if glyf[n].isComposite())

# 모든 글리프 데이터를 짝수 길이로 패딩(glyf.padding=2)
#   @pdf-lib/fontkit의 TTFSubset은 홀수 길이 글리프 뒤에 패딩을 넣지 않아
#   short-loca(오프셋/2 저장) 서브셋이 1바이트씩 밀려 글자가 깨진다.
#   소스 글리프가 전부 짝수 길이면 서브셋 오프셋도 항상 짝수라 버그가 발동하지 않는다.
glyf.padding = 2

font.save(args.dst)
print(f"{args.src} -> {args.dst}: wght={args.wght}, flattened={flattened}, "
      f"remaining_composites={remaining}, glyphs={len(font.getGlyphOrder())}")
