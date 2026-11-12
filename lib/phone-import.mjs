export function extractImportedPhones(text) {
  return Array.from(new Set(text.match(/\b[2-9]\d{7}\b/g) ?? []));
}
