const tunisianDateTimeFormatter = new Intl.DateTimeFormat("fr-TN", {
  timeZone: "Africa/Tunis",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const tunisianHourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Tunis",
  hour: "2-digit",
  hourCycle: "h23",
});

export function formatTunisiaDateTime(value) {
  if (typeof value !== "string" || !value.trim()) return value || "";

  const timestamp = value.trim();
  const utcTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    timestamp
  )
    ? `${timestamp.replace(" ", "T")}Z`
    : timestamp;
  const date = new Date(utcTimestamp);

  return Number.isNaN(date.getTime())
    ? value
    : tunisianDateTimeFormatter.format(date);
}

export function shouldCallCustomerToday(now = new Date()) {
  const hour = Number(
    tunisianHourFormatter
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value
  );
  return hour >= 9 && hour < 16;
}
