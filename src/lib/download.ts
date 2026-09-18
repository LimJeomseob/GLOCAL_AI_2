/** pdf-lib이 돌려준 바이트를 PDF 파일로 내려받게 한다. */
export function downloadPdf(filename: string, bytes: Uint8Array): void {
  // TS 5.7+ lib에서 Uint8Array<ArrayBufferLike>는 BlobPart로 바로 받지 않으므로 뷰 범위만 복사해 넘긴다.
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  downloadBlob(filename, new Blob([buffer], { type: "application/pdf" }));
}

/** 브라우저에서 Blob을 파일로 내려받게 한다(CSV 내보내기·PDF 제출본이 공유). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
