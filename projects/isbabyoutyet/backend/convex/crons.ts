import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "reset inactive homepage demos",
  { hours: 24 },
  internal.homepageDemo.resetIfInactive,
  {},
);

export default crons;
