import { router } from "../lib/trpc.js";
import { authRouter } from "./auth.js";
import { profileRouter } from "./profile.js";
import { postsRouter } from "./posts.js";
import { followRouter } from "./follow.js";
import { discoverRouter } from "./discover.js";
import { chatRouter } from "./chat.js";
import { notificationsRouter } from "./notifications.js";
import { coursesRouter } from "./courses.js";
import { paymentsRouter } from "./payments.js";
import { groupsRouter } from "./groups.js";
import { assessmentsRouter } from "./assessments.js";
import { jobsRouter } from "./jobs.js";
import { applicationsRouter } from "./applications.js";
import { contractsRouter } from "./contracts.js";
import { organizationsRouter } from "./organizations.js";
import { pushRouter } from "./push.js";
import { liveRouter } from "./live.js";

export const appRouter = router({
  auth: authRouter,
  profile: profileRouter,
  posts: postsRouter,
  follow: followRouter,
  discover: discoverRouter,
  chat: chatRouter,
  notifications: notificationsRouter,
  courses: coursesRouter,
  payments: paymentsRouter,
  groups: groupsRouter,
  assessments: assessmentsRouter,
  jobs: jobsRouter,
  applications: applicationsRouter,
  contracts: contractsRouter,
  organizations: organizationsRouter,
  push: pushRouter,
  live: liveRouter,
});

export type AppRouter = typeof appRouter;
