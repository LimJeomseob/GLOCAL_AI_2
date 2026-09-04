#!/usr/bin/env python3
"""링크 공유용 OG 썸네일(public/og-image.png, 1200×630) 생성기.

카카오톡·문자·슬랙 등에 포털 링크를 붙였을 때 뜨는 미리보기 이미지다.
한 장으로 "무슨 시스템인지"가 읽히도록 사업명·5단계 흐름·핵심 수치를 담는다.
문구는 src/lib/studyGroupConstants.ts 의 근거문서 원문을 따른다.

    pip install pillow
    python3 scripts/generate-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_BOLD = ROOT / "public/fonts/NotoSansKR-Bold-Cert.ttf"
FONT_REGULAR = ROOT / "public/fonts/NotoSansKR-Regular-Cert.ttf"
OUT = ROOT / "public/og-image.png"

W, H = 1200, 630
NAVY = (0, 56, 118)        # brand
NAVY_DARK = (0, 34, 74)    # brand.dark
BLUE = (11, 77, 162)       # brand.light / accent
GOLD = (255, 183, 3)       # --focus-ring
WHITE = (255, 255, 255)
MIST = (205, 220, 240)

# 운영개요 5단계 (studyGroupConstants.STUDY_FLOW_STEPS)
STEPS = [
    ("01", "연구모임 신청"),
    ("02", "계획서 심사"),
    ("03", "운영 안내"),
    ("04", "연구모임 운영"),
    ("05", "결과보고서 제출"),
]
FACTS = [
    ("신청기간", "9. 7.(월) ~ 9. 18.(금)"),
    ("선발규모", "10개 팀 · 최대 50명"),
    ("모임구성", "교원·학생 3~5명 자유 구성"),
]


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def main() -> None:
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # 배경: 좌상→우하 대각 그라데이션 느낌의 어두운 밴드 + 우측 장식 원
    for y in range(H):
        t = y / H
        c = tuple(int(NAVY[i] + (NAVY_DARK[i] - NAVY[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    d.ellipse([880, -220, 1420, 320], fill=BLUE)
    d.ellipse([1000, -140, 1340, 200], fill=NAVY)

    # 상단: GNU 배지 + 기관명
    d.rounded_rectangle([64, 56, 132, 124], radius=12, fill=WHITE)
    f_badge = font(FONT_BOLD, 26)
    tw = d.textlength("GNU", font=f_badge)
    d.text((98 - tw / 2, 72), "GNU", font=f_badge, fill=NAVY)
    d.text((150, 60), "경상국립대학교 글로컬대학30", font=font(FONT_BOLD, 26), fill=WHITE)
    d.text((150, 94), "AI융합원 · 글로컬 AI 동행 포털", font=font(FONT_REGULAR, 22), fill=MIST)

    # 제목
    d.text((64, 160), "2026학년도 2학기", font=font(FONT_BOLD, 40), fill=GOLD)
    d.text((64, 208), "AI 활용 연구모임", font=font(FONT_BOLD, 76), fill=WHITE)
    d.text((64, 306), "신청 · 심사 · 운영을 한곳에서 — 연구모임 원스톱 포털",
           font=font(FONT_REGULAR, 28), fill=MIST)

    # 5단계 흐름 칩
    f_no = font(FONT_BOLD, 17)
    f_step = font(FONT_BOLD, 21)
    y, chip_h, arrow_w = 376, 60, 30
    # 칩 폭을 먼저 합산해 1200px 안에 정확히 맞춘다(넘치면 잘려 보인다).
    widths = [int(d.textlength(t, font=f_step)) + 70 for _, t in STEPS]
    total = sum(widths) + arrow_w * (len(STEPS) - 1)
    x = (W - total) // 2
    for i, ((no, title), w) in enumerate(zip(STEPS, widths)):
        d.rounded_rectangle([x, y, x + w, y + chip_h], radius=14, fill=WHITE)
        d.rounded_rectangle([x + 10, y + 14, x + 42, y + 46], radius=8, fill=GOLD)
        nw = d.textlength(no, font=f_no)
        d.text((x + 26 - nw / 2, y + 18), no, font=f_no, fill=NAVY_DARK)
        d.text((x + 52, y + 16), title, font=f_step, fill=NAVY)
        x += w
        if i < len(STEPS) - 1:
            # 글꼴에 없는 화살표 글리프 대신 삼각형을 직접 그린다
            cx, cy = x + arrow_w // 2, y + chip_h // 2
            d.polygon([(cx - 6, cy - 9), (cx + 6, cy), (cx - 6, cy + 9)], fill=GOLD)
            x += arrow_w

    # 하단 핵심 수치 3칸
    d.line([(64, 476), (W - 64, 476)], fill=(60, 105, 165), width=1)
    f_label = font(FONT_REGULAR, 20)
    f_value = font(FONT_BOLD, 28)
    col_w = (W - 128) // 3
    for i, (label, value) in enumerate(FACTS):
        cx = 64 + i * col_w
        d.rectangle([cx, 500, cx + 4, 566], fill=GOLD)
        d.text((cx + 20, 498), label, font=f_label, fill=MIST)
        d.text((cx + 20, 526), value, font=f_value, fill=WHITE)

    img.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({W}x{H}, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
