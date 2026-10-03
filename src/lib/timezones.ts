export function validTimezone(value: string): boolean {
  if (!value || value.length > 100 || !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validLocation(location: { country: string; city: string; timezone: string }): boolean {
  return location.country.length > 0 && location.country.length <= 100 &&
    location.city.length > 0 && location.city.length <= 100 && validTimezone(location.timezone);
}
