import { expect, test } from "vitest";
import { parseMigrationRunnerReport } from "./migrations";

const validReport = {
  lastFinished: "2026-01-01",
  lastStarted: "2026-01-01",
  Name: "runTableMigrations",
  processed: 3,
  Status: "done",
  toStartOver: "no",
};

test("parseMigrationRunnerReport accepts a complete CLI report", () => {
  expect(parseMigrationRunnerReport(validReport)).toEqual(validReport);
});

test("parseMigrationRunnerReport rejects non-objects and incomplete payloads", () => {
  expect(() => parseMigrationRunnerReport(null)).toThrow(/invalid report/);
  expect(() => parseMigrationRunnerReport("x")).toThrow(/invalid report/);
  expect(() => parseMigrationRunnerReport({ ...validReport, Name: 1 })).toThrow(/invalid report/);
  expect(() => parseMigrationRunnerReport({ ...validReport, processed: "3" })).toThrow(
    /invalid report/,
  );
  expect(() => {
    const { Name: _Name, ...rest } = validReport;
    parseMigrationRunnerReport(rest);
  }).toThrow(/invalid report/);
});
