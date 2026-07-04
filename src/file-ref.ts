export type FileRef = {
  md5: string;
  key: string;
  ext: "pdf" | "zip";
  filename?: string;
};

const MD5_RE = /^[0-9a-f]{32}$/i;
const KEY_RE = /^([0-9a-f]{32})\.(pdf|zip)$/i;

export function parseFileRef(input: string): FileRef | null {
  const trimmed = input.trim();
  const urlRef = refFromUrl(trimmed);
  const raw = urlRef?.key ?? trimmed;
  const keyMatch = KEY_RE.exec(raw);
  if (keyMatch) {
    return {
      md5: keyMatch[1].toLowerCase(),
      key: `${keyMatch[1].toLowerCase()}.${keyMatch[2].toLowerCase()}`,
      ext: keyMatch[2].toLowerCase() as "pdf" | "zip",
      ...filenameField(urlRef?.filename)
    };
  }
  if (MD5_RE.test(raw)) {
    const md5 = raw.toLowerCase();
    return { md5, key: `${md5}.pdf`, ext: "pdf" };
  }
  return null;
}

function refFromUrl(input: string): { key: string; filename?: string } | null {
  try {
    const url = new URL(input);
    if (url.hostname !== "byrdocs.org") return null;
    const prefix = "/files/";
    if (!url.pathname.startsWith(prefix)) return null;
    return {
      key: decodeURIComponent(url.pathname.slice(prefix.length)),
      ...filenameField(url.searchParams.get("filename"))
    };
  } catch {
    return null;
  }
}

function filenameField(filename: string | null | undefined): { filename?: string } {
  const value = filename?.trim();
  return value ? { filename: value } : {};
}
