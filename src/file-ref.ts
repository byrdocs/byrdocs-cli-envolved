export type FileRef = {
  md5: string;
  key: string;
  ext: "pdf" | "zip";
};

const MD5_RE = /^[0-9a-f]{32}$/i;
const KEY_RE = /^([0-9a-f]{32})\.(pdf|zip)$/i;

export function parseFileRef(input: string): FileRef | null {
  const trimmed = input.trim();
  const urlKey = keyFromUrl(trimmed);
  const raw = urlKey ?? trimmed;
  const keyMatch = KEY_RE.exec(raw);
  if (keyMatch) {
    return {
      md5: keyMatch[1].toLowerCase(),
      key: `${keyMatch[1].toLowerCase()}.${keyMatch[2].toLowerCase()}`,
      ext: keyMatch[2].toLowerCase() as "pdf" | "zip"
    };
  }
  if (MD5_RE.test(raw)) {
    const md5 = raw.toLowerCase();
    return { md5, key: `${md5}.pdf`, ext: "pdf" };
  }
  return null;
}

function keyFromUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname !== "byrdocs.org") return null;
    const prefix = "/files/";
    if (!url.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}
