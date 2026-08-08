export function parseYmd(str) {
  const d = new Date(str);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDay(),
  };
}
