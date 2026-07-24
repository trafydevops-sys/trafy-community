import { z } from "zod";

export const pricingTypeSchema = z.enum(["free", "paid", "live"]);
export type PricingType = z.infer<typeof pricingTypeSchema>;

export const lessonContentTypeSchema = z.enum(["video", "text", "live"]);
export type LessonContentType = z.infer<typeof lessonContentTypeSchema>;

// --- Course CRUD (creator/"Teach" side) ---

export const createCourseInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  pricingType: pricingTypeSchema.default("free"),
  priceCents: z.number().int().nonnegative().default(0),
  currency: z.string().length(3).default("usd"),
  // When set, the course is published under an organization/institution
  // rather than the creator's personal name — see organization.ts.
  organizationId: z.string().uuid().optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseInput>;

export const updateCourseInput = createCourseInput.partial().extend({
  courseId: z.string().uuid(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseInput>;

export const setPublishedInput = z.object({
  courseId: z.string().uuid(),
  published: z.boolean(),
});
export type SetPublishedInput = z.infer<typeof setPublishedInput>;

export const addModuleInput = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
});
export type AddModuleInput = z.infer<typeof addModuleInput>;

export const addLessonInput = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  contentType: lessonContentTypeSchema,
  videoUrl: z.string().optional(),
  textContent: z.string().trim().max(20000).optional(),
  scheduledAt: z.string().datetime().optional(),
  // Sample lessons preview free even in a paid course, without requiring enrollment.
  isSample: z.boolean().default(false),
});
export type AddLessonInput = z.infer<typeof addLessonInput>;

// --- Catalog + detail (learner/"Learn" side) ---

export const courseSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  pricingType: pricingTypeSchema,
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
  published: z.boolean(),
  creatorId: z.string().uuid(),
  creatorName: z.string(),
  organizationId: z.string().uuid().optional(),
  organizationName: z.string().optional(),
  enrollmentCount: z.number().int().nonnegative(),
  // Omitted when the course has no reviews yet.
  avgRating: z.number().min(1).max(5).optional(),
  reviewCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type CourseSummary = z.infer<typeof courseSummarySchema>;

export const lessonSchema = z.object({
  id: z.string().uuid(),
  moduleId: z.string().uuid(),
  title: z.string(),
  contentType: lessonContentTypeSchema,
  order: z.number().int(),
  scheduledAt: z.string().optional(),
  isSample: z.boolean(),
  // Populated only when the viewer is enrolled, the course is free, they're the
  // creator, or the lesson is a sample.
  videoUrl: z.string().optional(),
  textContent: z.string().optional(),
  locked: z.boolean(),
  completed: z.boolean(),
});
export type Lesson = z.infer<typeof lessonSchema>;

export const moduleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  order: z.number().int(),
  lessons: z.array(lessonSchema),
});
export type CourseModule = z.infer<typeof moduleSchema>;

// --- Cohort scheduling ---

export const createCohortInput = z.object({
  courseId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  capacity: z.number().int().positive().optional(),
});
export type CreateCohortInput = z.infer<typeof createCohortInput>;

export const listCohortsInput = z.object({ courseId: z.string().uuid() });
export type ListCohortsInput = z.infer<typeof listCohortsInput>;

export const cohortSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  capacity: z.number().int().positive().optional(),
  enrolledCount: z.number().int().nonnegative(),
  // Omitted when the cohort is uncapped.
  seatsLeft: z.number().int().optional(),
});
export type Cohort = z.infer<typeof cohortSchema>;

export const reviewSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
  authorName: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const courseDetailSchema = courseSummarySchema.extend({
  modules: z.array(moduleSchema),
  enrolled: z.boolean(),
  progressPercent: z.number().int().min(0).max(100),
  cohorts: z.array(cohortSchema),
  // True once every lesson in the course has been marked complete — gates
  // whether the learner may leave a review.
  completed: z.boolean(),
  reviews: z.array(reviewSchema),
  myReview: reviewSchema.optional(),
});
export type CourseDetail = z.infer<typeof courseDetailSchema>;

// --- Reviews ---

export const submitReviewInput = z.object({
  courseId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewInput>;

export const deleteReviewInput = z.object({ courseId: z.string().uuid() });
export type DeleteReviewInput = z.infer<typeof deleteReviewInput>;

export const listCoursesInput = z.object({
  query: z.string().trim().max(200).optional(),
});
export type ListCoursesInput = z.infer<typeof listCoursesInput>;

export const getCourseInput = z.object({ courseId: z.string().uuid() });
export type GetCourseInput = z.infer<typeof getCourseInput>;

export const setLessonProgressInput = z.object({
  lessonId: z.string().uuid(),
  completed: z.boolean(),
});
export type SetLessonProgressInput = z.infer<typeof setLessonProgressInput>;

export const myEnrollmentSchema = z.object({
  course: courseSummarySchema,
  progressPercent: z.number().int().min(0).max(100),
  enrolledAt: z.string(),
});
export type MyEnrollment = z.infer<typeof myEnrollmentSchema>;
