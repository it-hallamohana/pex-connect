import { mallCatalog } from "./mall-catalog.mjs";
export const departmentOptions = mallCatalog.departments.filter(
  ([code]) => code !== "MOD",
);
export const roles = {
  staff: "Staf",
  supervisor: "Supervisor",
  assistant_manager: "Assistant Manager",
  manager: "Manager",
  executive: "Executive",
  admin: "Administrator",
  tenant: "Tenant",
};
export const jobTitles = [
  "Executive",
  "General Manager",
  "Mall Manager",
  "Manager",
  "Assistant Manager",
  "Supervisor",
  "Chief Engineering",
  "HR&GA Manager",
  "Marcomm Manager",
  "Asst. IT Manager",
  "Accounting & Purchasing Supervisor",
  "Engineering Supervisor",
  "Engineer",
  "Teknisi",
  "Housekeeping Attendant",
  "Security Officer",
  "Customer Service Officer",
  "Tenant Representative",
];
export const isAdministrator = (role) => ["admin", "executive"].includes(role);
export const hasGlobalRequests = (role) =>
  ["admin", "executive", "manager", "assistant_manager"].includes(role);
export const canDashboard = (role) =>
  hasGlobalRequests(role) || role === "supervisor";
export function suggestedRole(title, type = "staff") {
  if (type === "tenant") return "tenant";
  const key = (title || "").trim().toLowerCase();
  if (
    [
      "executive",
      "general manager",
      "general manager mall",
      "superadmin",
    ].includes(key)
  )
    return "executive";
  if (
    [
      "manager",
      "mall manager",
      "department head",
      "chief engineering",
      "hr&ga manager",
      "marcomm manager",
    ].includes(key)
  )
    return "manager";
  if (
    [
      "assistant manager",
      "asst. it manager",
      "assisten manager",
      "asisten manager",
    ].includes(key)
  )
    return "assistant_manager";
  if (
    [
      "supervisor",
      "engineering supervisor",
      "accounting & purchasing supervisor",
    ].includes(key)
  )
    return "supervisor";
  return "staff";
}
export function registrationValues(form) {
  return {
    p_full_name: form.get("full_name")?.trim(),
    p_phone: form.get("phone")?.trim(),
    p_job_title: form.get("job_title")?.trim(),
    p_department_code: form.get("department"),
    p_account_type: form.get("account_type"),
    p_tenant_name: form.get("tenant_name")?.trim() || null,
    p_unit_number: form.get("unit_number")?.trim() || null,
  };
}
