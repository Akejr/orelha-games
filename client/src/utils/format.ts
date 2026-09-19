export function ordinal(place: number): string {
  if (place <= 0 || place > 90) return '-';
  return `${place}º`;
}

export function placeLabel(place: number): string {
  switch (place) {
    case 1:
      return 'Campeão';
    case 2:
      return 'Vice';
    case 3:
      return 'Bronze';
    default:
      return `${place}º lugar`;
  }
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = count === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${count} ${word}`;
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function seconds(value: number, digits = 1): string {
  return `${value.toFixed(digits)}s`;
}

export function shortName(name: string, max = 12): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}
