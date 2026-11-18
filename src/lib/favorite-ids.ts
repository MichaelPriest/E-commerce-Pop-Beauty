const publicProductId=/^(?:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|demo-[1-9][0-9]*)$/i;

export function normalizeFavoriteIds(raw:unknown):string[]{
 if(!Array.isArray(raw))return [];
 return [...new Set(raw.filter((id):id is string=>typeof id==='string'&&publicProductId.test(id)).map(id=>id.toLowerCase()))];
}
