const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const todayIso = () => toIsoDate(new Date());

export const parseIsoDate = (value) => {
  const match = ISO_DATE_PATTERN.exec(String(value || ""));
  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12
  );
  if (toIsoDate(date) !== value) return null;
  return date;
};

export const addDaysToIso = (value, numberOfDays) => {
  const date = parseIsoDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + numberOfDays);
  return toIsoDate(date);
};

export const formatMealDate = (value) => {
  const date = parseIsoDate(value);
  if (!date) return String(value || "");

  const formatted = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};
