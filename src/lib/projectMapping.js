// projects 雲端 row 與前端 project 物件集中在這裡轉換。

export const DATA_FIELDS = [
  'template',
  'startDate', 'surveyStart', 'surveyEnd', 'campaignStart', 'campaignEnd',
  'tone', 'color', 'tasks', 'kols', 'notes',
];

// DB row → 前端扁平 project
export function rowToProject(row) {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    version: row.version ?? 0,
    is_archive: !!row.is_archived,
    ...(row.data || {}),
  };
}

export function projectToRow(p) {
  const data = {};
  for (const k of DATA_FIELDS) data[k] = p[k];
  return {
    name: p.name,
    position: p.position,
    is_archived: !!p.is_archive,
    data,
  };
}
