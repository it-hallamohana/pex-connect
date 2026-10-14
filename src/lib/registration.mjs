import { mallCatalog } from "./mall-catalog.mjs";
export const departmentOptions = mallCatalog.departments;
export const roles = {
  admin: "Administrator",
  supervisor: "Supervisor",
  staff: "Staf",
  tenant: "Tenant",
};
export const jobTitles = [
  "General Manager",
  "Mall Manager",
  "Duty Manager",
  "Department Head",
  "Manager",
  "Assistant Manager",
  "Supervisor",
  "Chief Engineering",
  "Engineer",
  "Teknisi",
  "Housekeeping Attendant",
  "Security Officer",
  "Customer Service Officer",
  "Tenant Relations Officer",
  "Tenant Representative",
  "Administrator",
];
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
