"use client";
import { useState } from "react";
import { jobTitles } from "@/lib/registration.mjs";
export default function JobTitleField({
  defaultValue = "",
  label = "Jabatan yang diajukan *",
}) {
  const [choice, setChoice] = useState(
    jobTitles.includes(defaultValue)
      ? defaultValue
      : defaultValue
        ? "other"
        : "",
  );
  return (
    <>
      <label>
        {label}
        <select
          required
          name={choice === "other" ? "job_title_choice" : "job_title"}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="" disabled>
            Pilih jabatan
          </option>
          {jobTitles.map((title) => (
            <option key={title}>{title}</option>
          ))}
          <option value="other">Lainnya</option>
        </select>
      </label>
      {choice === "other" && (
        <label>
          Jabatan lainnya *
          <input
            name="job_title"
            required
            minLength={2}
            maxLength={100}
            defaultValue={jobTitles.includes(defaultValue) ? "" : defaultValue}
            placeholder="Tuliskan jabatan Anda"
          />
        </label>
      )}
    </>
  );
}
