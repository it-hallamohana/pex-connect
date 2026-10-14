export const statuses = {
  pending: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  rejected: "Rejected",
};
export const priorities = {
  low: "Rendah",
  medium: "Normal",
  high: "Tinggi",
  emergency: "Darurat",
};
export const categories = [
  "Keluhan AC",
  "Kebersihan Toilet",
  "Kebocoran",
  "Parkir",
  "Izin Kerja Tenant",
  "Listrik",
  "Keamanan",
  "Lainnya",
];
export const locations = [
  "Ground Floor",
  "Lantai 1",
  "Lantai 2",
  "Lantai 3",
  "Basement",
  "Area Parkir",
  "Area Luar",
];
export function canManage(profile, ticket) {
  return (
    profile.role === "admin" ||
    (["staff", "supervisor"].includes(profile.role) &&
      profile.department_id === ticket.department_id)
  );
}
export function transitions(status, role) {
  const next =
    {
      pending: ["in_progress", "rejected"],
      in_progress: ["resolved"],
      resolved: ["closed", "in_progress"],
      closed: [],
      rejected: [],
    }[status] || [];
  return next.filter(
    (s) =>
      !["closed", "rejected"].includes(s) ||
      ["admin", "supervisor"].includes(role),
  );
}
export function jakartaDay(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function metrics(tickets) {
  return [
    tickets.length,
    tickets.filter((t) => t.status === "pending").length,
    tickets.filter((t) => t.status === "in_progress").length,
    tickets.filter(
      (t) =>
        t.resolved_at &&
        ["resolved", "closed"].includes(t.status) &&
        jakartaDay(t.resolved_at) === jakartaDay(),
    ).length,
  ];
}
export function validateImage(bytes, type, size) {
  if (size <= 0 || size > 5 * 1024 * 1024) return false;
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  if (type === "image/webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}
