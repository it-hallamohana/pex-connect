import { jakartaDay } from "./domain.mjs";
export function filterRequests(tickets, filters = {}, departmentId) {
  const {
    department,
    sender,
    status,
    floor,
    from,
    to,
    search,
    relation,
    category,
    priority,
  } = filters;
  return tickets.filter((t) => {
    const day = jakartaDay(t.created_at);
    return (
      (!department || t.department_id === department) &&
      (!sender ||
        (sender === "unassigned"
          ? !t.reported_department_id
          : t.reported_department_id === sender)) &&
      (!floor || t.location.startsWith(floor)) &&
      (!category || t.category === category) &&
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!priority ||
        (priority === "urgent"
          ? ["high", "emergency"].includes(t.priority)
          : t.priority === priority)) &&
      (!status ||
        (status === "completed"
          ? ["resolved", "closed"].includes(t.status)
          : status === "active"
            ? ["pending", "in_progress"].includes(t.status)
            : status === "today"
              ? t.resolved_at &&
                ["resolved", "closed"].includes(t.status) &&
                jakartaDay(t.resolved_at) === jakartaDay()
              : t.status === status)) &&
      (!relation ||
        (relation === "incoming"
          ? t.department_id === departmentId
          : relation === "outgoing"
            ? t.reported_department_id === departmentId
            : t.department_id === departmentId ||
              t.reported_department_id === departmentId)) &&
      (!search ||
        `${t.title} ${t.ticket_number} ${t.location} ${t.category}`
          .toLowerCase()
          .includes(search.toLowerCase()))
    );
  });
}
export function groupRequests(tickets, field) {
  const counts = new Map();
  for (const t of tickets) {
    const key =
      field === "day" ? jakartaDay(t.created_at) : t[field] || "unassigned";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
