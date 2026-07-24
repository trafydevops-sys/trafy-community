import { TRPCError } from "@trpc/server";
import { and, asc, avg, count, desc, eq, ilike, or } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  addLessonInput,
  addModuleInput,
  createCohortInput,
  createCourseInput,
  deleteReviewInput,
  getCourseInput,
  getOrganizationInput,
  listCohortsInput,
  listCoursesInput,
  setLessonProgressInput,
  setPublishedInput,
  submitReviewInput,
  updateCourseInput,
  type Cohort,
  type CourseDetail,
  type CourseModule,
  type CourseSummary,
  type Lesson,
  type Review,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

async function creatorName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

async function toSummary(row: typeof schema.courses.$inferSelect): Promise<CourseSummary> {
  const enrollmentRows = await db
    .select({ value: count() })
    .from(schema.enrollments)
    .where(eq(schema.enrollments.courseId, row.id));
  const enrollmentCount = enrollmentRows[0]?.value ?? 0;

  const reviewStatRows = await db
    .select({ avgRating: avg(schema.courseReviews.rating), reviewCount: count() })
    .from(schema.courseReviews)
    .where(eq(schema.courseReviews.courseId, row.id));
  const reviewCount = reviewStatRows[0]?.reviewCount ?? 0;
  const avgRating = reviewStatRows[0]?.avgRating != null ? Number(reviewStatRows[0].avgRating) : undefined;

  let organizationName: string | undefined;
  if (row.organizationId) {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, row.organizationId)).limit(1);
    organizationName = org?.name;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    pricingType: row.pricingType as CourseSummary["pricingType"],
    priceCents: row.priceCents,
    currency: row.currency,
    published: row.published,
    creatorId: row.creatorId,
    creatorName: await creatorName(row.creatorId),
    organizationId: row.organizationId ?? undefined,
    organizationName,
    enrollmentCount,
    avgRating,
    reviewCount,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toReview(row: typeof schema.courseReviews.$inferSelect): Promise<Review> {
  return {
    id: row.id,
    courseId: row.courseId,
    userId: row.userId,
    authorName: (await creatorName(row.userId)) || "Anonymous",
    rating: row.rating,
    comment: row.comment ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function toCohort(row: typeof schema.cohorts.$inferSelect): Promise<Cohort> {
  const enrolledRows = await db.select({ value: count() }).from(schema.enrollments).where(eq(schema.enrollments.cohortId, row.id));
  const enrolledCount = enrolledRows[0]?.value ?? 0;

  return {
    id: row.id,
    courseId: row.courseId,
    name: row.name,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    capacity: row.capacity ?? undefined,
    enrolledCount,
    seatsLeft: row.capacity != null ? Math.max(0, row.capacity - enrolledCount) : undefined,
  };
}

/** Creator, or an owner/admin of the org the course is published under, may manage it. */
async function assertOwner(courseId: string, userId: string) {
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  if (course.creatorId === userId) return course;

  if (course.organizationId) {
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.organizationId, course.organizationId), eq(schema.organizationMembers.userId, userId)))
      .limit(1);
    if (member && (member.role === "owner" || member.role === "admin")) return course;
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Not your course." });
}

export const coursesRouter = router({
  create: protectedProcedure.input(createCourseInput).mutation(async ({ ctx, input }) => {
    if (input.organizationId) {
      const [member] = await db
        .select()
        .from(schema.organizationMembers)
        .where(
          and(eq(schema.organizationMembers.organizationId, input.organizationId), eq(schema.organizationMembers.userId, ctx.user.sub))
        )
        .limit(1);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of that organization." });
    }

    const [row] = await db
      .insert(schema.courses)
      .values({ creatorId: ctx.user.sub, ...input })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row);
  }),

  update: protectedProcedure.input(updateCourseInput).mutation(async ({ ctx, input }) => {
    const { courseId, ...rest } = input;
    await assertOwner(courseId, ctx.user.sub);
    const [row] = await db
      .update(schema.courses)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(schema.courses.id, courseId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row);
  }),

  setPublished: protectedProcedure.input(setPublishedInput).mutation(async ({ ctx, input }) => {
    await assertOwner(input.courseId, ctx.user.sub);
    const [row] = await db
      .update(schema.courses)
      .set({ published: input.published, updatedAt: new Date() })
      .where(eq(schema.courses.id, input.courseId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row);
  }),

  addModule: protectedProcedure.input(addModuleInput).mutation(async ({ ctx, input }) => {
    await assertOwner(input.courseId, ctx.user.sub);
    const countRows = await db
      .select({ value: count() })
      .from(schema.courseModules)
      .where(eq(schema.courseModules.courseId, input.courseId));
    const existingCount = countRows[0]?.value ?? 0;
    const [row] = await db
      .insert(schema.courseModules)
      .values({ courseId: input.courseId, title: input.title, order: existingCount })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return { id: row.id, title: row.title, order: row.order };
  }),

  addLesson: protectedProcedure.input(addLessonInput).mutation(async ({ ctx, input }) => {
    const [mod] = await db.select().from(schema.courseModules).where(eq(schema.courseModules.id, input.moduleId)).limit(1);
    if (!mod) throw new TRPCError({ code: "NOT_FOUND" });
    await assertOwner(mod.courseId, ctx.user.sub);

    const countRows = await db
      .select({ value: count() })
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.moduleId, input.moduleId));
    const existingCount = countRows[0]?.value ?? 0;

    const [row] = await db
      .insert(schema.courseLessons)
      .values({
        moduleId: input.moduleId,
        title: input.title,
        contentType: input.contentType,
        videoUrl: input.videoUrl,
        textContent: input.textContent,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        isSample: input.isSample,
        order: existingCount,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return { id: row.id };
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(schema.courses).where(eq(schema.courses.creatorId, ctx.user.sub));
    return Promise.all(rows.map(toSummary));
  }),

  listByOrg: protectedProcedure.input(getOrganizationInput).query(async ({ ctx, input }) => {
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.organizationId, input.organizationId), eq(schema.organizationMembers.userId, ctx.user.sub)))
      .limit(1);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of that organization." });

    const rows = await db.select().from(schema.courses).where(eq(schema.courses.organizationId, input.organizationId));
    return Promise.all(rows.map(toSummary));
  }),

  listPublished: protectedProcedure.input(listCoursesInput).query(async ({ input }) => {
    const whereCondition = input.query
      ? and(eq(schema.courses.published, true), or(ilike(schema.courses.title, `%${input.query}%`), ilike(schema.courses.description, `%${input.query}%`)))
      : eq(schema.courses.published, true);

    const rows = await db.select().from(schema.courses).where(whereCondition);
    return Promise.all(rows.map(toSummary));
  }),

  getById: protectedProcedure.input(getCourseInput).query(async ({ ctx, input }) => {
    const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, input.courseId)).limit(1);
    if (!course) throw new TRPCError({ code: "NOT_FOUND" });

    const isCreator = course.creatorId === ctx.user.sub;
    if (!course.published && !isCreator) throw new TRPCError({ code: "NOT_FOUND" });

    const [enrollment] = await db
      .select()
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.courseId, course.id), eq(schema.enrollments.userId, ctx.user.sub)))
      .limit(1);
    const enrolled = Boolean(enrollment);
    const canSeeContent = enrolled || isCreator || course.pricingType === "free";

    const moduleRows = await db
      .select()
      .from(schema.courseModules)
      .where(eq(schema.courseModules.courseId, course.id))
      .orderBy(asc(schema.courseModules.order));

    const progressRows = enrolled
      ? await db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.userId, ctx.user.sub))
      : [];
    const completedLessonIds = new Set(progressRows.map((p) => p.lessonId));

    let totalLessons = 0;
    let completedLessons = 0;

    const modules: CourseModule[] = [];
    for (const mod of moduleRows) {
      const lessonRows = await db
        .select()
        .from(schema.courseLessons)
        .where(eq(schema.courseLessons.moduleId, mod.id))
        .orderBy(asc(schema.courseLessons.order));

      const lessons: Lesson[] = lessonRows.map((l) => {
        totalLessons += 1;
        const completed = completedLessonIds.has(l.id);
        if (completed) completedLessons += 1;
        const unlocked = canSeeContent || l.isSample;
        return {
          id: l.id,
          moduleId: l.moduleId,
          title: l.title,
          contentType: l.contentType as Lesson["contentType"],
          order: l.order,
          scheduledAt: l.scheduledAt?.toISOString(),
          isSample: l.isSample,
          videoUrl: unlocked ? (l.videoUrl ?? undefined) : undefined,
          textContent: unlocked ? (l.textContent ?? undefined) : undefined,
          locked: !unlocked,
          completed,
        };
      });

      modules.push({ id: mod.id, title: mod.title, order: mod.order, lessons });
    }

    const cohortRows = await db.select().from(schema.cohorts).where(eq(schema.cohorts.courseId, course.id)).orderBy(asc(schema.cohorts.startDate));
    const cohorts = await Promise.all(cohortRows.map(toCohort));

    const reviewRows = await db
      .select()
      .from(schema.courseReviews)
      .where(eq(schema.courseReviews.courseId, course.id))
      .orderBy(desc(schema.courseReviews.createdAt));
    const reviews = await Promise.all(reviewRows.map(toReview));
    const myReviewRow = reviewRows.find((r) => r.userId === ctx.user.sub);

    const summary = await toSummary(course);
    const detail: CourseDetail = {
      ...summary,
      modules,
      enrolled,
      progressPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      cohorts,
      completed: Boolean(enrollment?.completedAt),
      reviews,
      myReview: myReviewRow ? await toReview(myReviewRow) : undefined,
    };
    return detail;
  }),

  createCohort: protectedProcedure.input(createCohortInput).mutation(async ({ ctx, input }) => {
    await assertOwner(input.courseId, ctx.user.sub);
    const [row] = await db
      .insert(schema.cohorts)
      .values({
        courseId: input.courseId,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        capacity: input.capacity,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toCohort(row);
  }),

  listCohorts: protectedProcedure.input(listCohortsInput).query(async ({ input }) => {
    const rows = await db.select().from(schema.cohorts).where(eq(schema.cohorts.courseId, input.courseId)).orderBy(asc(schema.cohorts.startDate));
    return Promise.all(rows.map(toCohort));
  }),

  setProgress: protectedProcedure.input(setLessonProgressInput).mutation(async ({ ctx, input }) => {
    const [lesson] = await db
      .select()
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.id, input.lessonId))
      .limit(1);
    if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });

    const [mod] = await db.select().from(schema.courseModules).where(eq(schema.courseModules.id, lesson.moduleId)).limit(1);
    if (!mod) throw new TRPCError({ code: "NOT_FOUND" });

    const [enrollment] = await db
      .select()
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.courseId, mod.courseId), eq(schema.enrollments.userId, ctx.user.sub)))
      .limit(1);
    if (!enrollment) throw new TRPCError({ code: "FORBIDDEN", message: "Enroll in the course first." });

    if (input.completed) {
      await db
        .insert(schema.lessonProgress)
        .values({ userId: ctx.user.sub, lessonId: input.lessonId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(schema.lessonProgress)
        .where(and(eq(schema.lessonProgress.userId, ctx.user.sub), eq(schema.lessonProgress.lessonId, input.lessonId)));
    }

    // Recompute course completion so review eligibility stays accurate as
    // lessons are checked/unchecked.
    const lessonRows = await db
      .select({ id: schema.courseLessons.id })
      .from(schema.courseLessons)
      .innerJoin(schema.courseModules, eq(schema.courseLessons.moduleId, schema.courseModules.id))
      .where(eq(schema.courseModules.courseId, mod.courseId));
    const progressRows = await db
      .select({ lessonId: schema.lessonProgress.lessonId })
      .from(schema.lessonProgress)
      .where(eq(schema.lessonProgress.userId, ctx.user.sub));
    const completedIds = new Set(progressRows.map((p) => p.lessonId));
    const allCompleted = lessonRows.length > 0 && lessonRows.every((l) => completedIds.has(l.id));

    await db
      .update(schema.enrollments)
      .set({ completedAt: allCompleted ? new Date() : null })
      .where(eq(schema.enrollments.id, enrollment.id));

    return { ok: true as const };
  }),

  submitReview: protectedProcedure.input(submitReviewInput).mutation(async ({ ctx, input }) => {
    const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, input.courseId)).limit(1);
    if (!course) throw new TRPCError({ code: "NOT_FOUND" });

    const [enrollment] = await db
      .select()
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.courseId, input.courseId), eq(schema.enrollments.userId, ctx.user.sub)))
      .limit(1);
    if (!enrollment?.completedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Finish the course before leaving a review." });

    const [row] = await db
      .insert(schema.courseReviews)
      .values({ courseId: input.courseId, userId: ctx.user.sub, rating: input.rating, comment: input.comment })
      .onConflictDoUpdate({
        target: [schema.courseReviews.courseId, schema.courseReviews.userId],
        set: { rating: input.rating, comment: input.comment, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toReview(row);
  }),

  deleteReview: protectedProcedure.input(deleteReviewInput).mutation(async ({ ctx, input }) => {
    await db
      .delete(schema.courseReviews)
      .where(and(eq(schema.courseReviews.courseId, input.courseId), eq(schema.courseReviews.userId, ctx.user.sub)));
    return { ok: true as const };
  }),

  myEnrollments: protectedProcedure.query(async ({ ctx }) => {
    const enrollmentRows = await db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, ctx.user.sub));

    const results = await Promise.all(
      enrollmentRows.map(async (enrollment) => {
        const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, enrollment.courseId)).limit(1);
        if (!course) return null;

        const moduleRows = await db.select().from(schema.courseModules).where(eq(schema.courseModules.courseId, course.id));
        let total = 0;
        let completed = 0;
        for (const mod of moduleRows) {
          const lessonRows = await db.select().from(schema.courseLessons).where(eq(schema.courseLessons.moduleId, mod.id));
          total += lessonRows.length;
          for (const lesson of lessonRows) {
            const [progress] = await db
              .select()
              .from(schema.lessonProgress)
              .where(and(eq(schema.lessonProgress.userId, ctx.user.sub), eq(schema.lessonProgress.lessonId, lesson.id)))
              .limit(1);
            if (progress) completed += 1;
          }
        }

        return {
          course: await toSummary(course),
          progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
          enrolledAt: enrollment.enrolledAt.toISOString(),
        };
      })
    );
    return results.filter((r) => r !== null);
  }),
});
