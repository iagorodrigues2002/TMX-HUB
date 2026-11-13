export function migrateTrafficSettings(section: string, raw: string, company: string) {
  const value = JSON.parse(raw);
  const remap = (id: string) => id.replace(/^.*:(bms|accounts):([^:]+)$/, `creative-company:${company}:$1:$2`);
  if (section === 'inventory') {
    for (const kind of ['bms', 'accounts'])
      for (const item of value[kind] ?? []) { item.id = remap(item.id); item.bm = remap(item.bm); }
  }
  if (section === 'structure')
    for (const item of value) item.assets = item.assets.map(remap);
  return value;
}
