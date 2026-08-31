import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  ORG_NAME,
  ORGANIZER_NAME,
} from "@/lib/constants";
import { STUDY_PROGRAM_NAME } from "@/lib/studyGroupConstants";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-500 sm:px-6">
        <p className="font-semibold text-slate-700">{ORG_NAME} 글로컬대학30 사업단</p>
        <p className="mt-1">{STUDY_PROGRAM_NAME}</p>
        <p className="mt-1">주관: {ORGANIZER_NAME}</p>
        <p className="mt-1">
          문의: {CONTACT_PHONE}, {CONTACT_EMAIL}
        </p>
        <p className="mt-1">
          수집된 개인정보는 연구모임 신청·심사·운영 및 이수혜택 지급 목적에만 사용되며, 사업 종료 후
          관계 법령에 따라 보관 후 파기됩니다.
        </p>
      </div>
    </footer>
  );
}
