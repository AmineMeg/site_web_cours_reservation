export function browserTimezone(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezone = detected === "UTC" || detected === "GMT" ? "Etc/UTC" : detected;
  if (!validTimezone(timezone)) throw new Error("Browser timezone unavailable");
  return timezone;
}

export function validTimezone(value: string): boolean {
  if (!value || value.length > 100 || !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validLocation(location: { country: string; timezone: string }): boolean {
  return location.country.length > 0 && location.country.length <= 100 &&
    validTimezone(location.timezone);
}
