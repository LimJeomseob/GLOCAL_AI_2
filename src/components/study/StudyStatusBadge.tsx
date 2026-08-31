import clsx from "clsx";
import { STUDY_STATUS_LABELS, type StudyGroupStatus } from "@/lib/studyTypes";

const STATUS_CLASSES: Record<StudyGroupStatus, string> = {
  draft: "bg-slate-200 text-slate-700",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-indigo-100 text-indigo-800",
  selected: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  in_progress: "bg-sky-100 text-sky-800",
  report_submitted: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-600 text-white",
  cancelled: "bg-slate-200 text-slate-500",
};

export function StudyStatusBadge({ status }: { status: StudyGroupStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
        STATUS_CLASSES[status]
      )}
    >
      {STUDY_STATUS_LABELS[status]}
    </span>
  );
}
