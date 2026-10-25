"use client";

export const MAX_SCRIPT_CHARS = 20_000;

/** Extracts plain text from a .txt, .docx or .pdf file entirely in the browser. */
export async function extractScriptText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  let text: string;
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    text = await file.text();
  } else if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else if (name.endsWith(".pdf")) {
    text = await extractPdfText(file);
  } else if (name.endsWith(".doc")) {
    throw new Error("Old .doc files aren't supported. Save it as .docx or .pdf, or paste the text.");
  } else {
    throw new Error("Unsupported file. Use .txt, .docx or .pdf, or paste the text.");
  }
  text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("No text found in that file. If it's a scanned PDF, paste the text instead.");
  return text.slice(0, MAX_SCRIPT_CHARS);
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      } else if (item.str && !item.str.endsWith(" ")) {
        line += " ";
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  await task.destroy();
  return pages.join("\n\n");
}
