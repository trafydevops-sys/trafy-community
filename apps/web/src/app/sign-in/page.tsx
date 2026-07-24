import type { Metadata } from "next";
import { OtpAuthForm } from "@/components/otp-auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Trafy Community with a one-time email code — no password required.",
};

export default function SignInPage() {
  return <OtpAuthForm heading="Welcome back" subheading="Enter your email and we'll send a one-time code to sign you in." />;
}
